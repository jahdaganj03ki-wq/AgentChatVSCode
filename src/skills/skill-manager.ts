import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { Skill, SkillInfo, SkillSource, SkillState, SkillFormat } from './types';
import { parseSkillMd } from './format-parsers/skill-md-parser';
import { parseClaudeSkill } from './format-parsers/claude-parser';
import { parseCodexSkill } from './format-parsers/codex-parser';
import { parseZCodeSkill } from './format-parsers/zcode-parser';
import { Logger } from '../utils/logger';

const STORAGE_KEY = 'apexagent.skills';
const SKILL_DIR_NAMES = ['skills', 'skill'];

interface PersistedState {
  activeNames: string[];
  errorNames: string[];
}

export class SkillManager {
  private skills: Map<string, Skill> = new Map();
  private activeNames: Set<string> = new Set();
  private errorNames: Set<string> = new Set();
  private storage: vscode.Memento;

  constructor(context: vscode.ExtensionContext) {
    this.storage = context.globalState;
  }

  async initialize(): Promise<void> {
    await this.load();
    await this.discover();
  }

  private async load(): Promise<void> {
    try {
      const saved = this.storage.get<PersistedState>(STORAGE_KEY);
      if (saved) {
        this.activeNames = new Set(saved.activeNames || []);
        this.errorNames = new Set(saved.errorNames || []);
      }
    } catch {
      Logger.warn('SkillManager', 'Failed to load persisted state');
    }
  }

  private async save(): Promise<void> {
    try {
      await this.storage.update(STORAGE_KEY, {
        activeNames: Array.from(this.activeNames),
        errorNames: Array.from(this.errorNames),
      } satisfies PersistedState);
    } catch {
      Logger.warn('SkillManager', 'Failed to save state');
    }
  }

  async discover(): Promise<SkillInfo[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const rootPath = workspaceFolders?.[0]?.uri.fsPath;
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';

    const scanPaths: { base: string; source: SkillSource }[] = [];

    if (rootPath) {
      scanPaths.push({ base: path.join(rootPath, '.apexagent'), source: { type: 'local', path: rootPath } });
      scanPaths.push({ base: path.join(rootPath, '.kilo'), source: { type: 'local', path: rootPath } });
      scanPaths.push({ base: path.join(rootPath, '.codex'), source: { type: 'local', path: rootPath } });
      scanPaths.push({ base: path.join(rootPath, '.claude'), source: { type: 'local', path: rootPath } });
      scanPaths.push({ base: path.join(rootPath, '.github'), source: { type: 'local', path: rootPath } });
      scanPaths.push({ base: path.join(rootPath, '.opencode'), source: { type: 'local', path: rootPath } });
    }

    if (homeDir) {
      scanPaths.push({ base: path.join(homeDir, '.apexagent'), source: { type: 'local', path: homeDir } });
      scanPaths.push({ base: path.join(homeDir, '.config', 'kilo'), source: { type: 'local', path: homeDir } });
      scanPaths.push({ base: path.join(homeDir, '.codex'), source: { type: 'local', path: homeDir } });
      scanPaths.push({ base: path.join(homeDir, '.claude'), source: { type: 'local', path: homeDir } });
      scanPaths.push({ base: path.join(homeDir, '.github'), source: { type: 'local', path: homeDir } });
    }

    const config = vscode.workspace.getConfiguration('apexagent');
    const customPaths = config.get<string[]>('skills.paths', []);
    for (const p of customPaths) {
      scanPaths.push({ base: p, source: { type: 'local', path: p } });
    }

    const existingNames = new Set(this.skills.keys());

    for (const { base, source } of scanPaths) {
      await this.scanPathForSkills(base, source);
    }

    // Apply saved state to newly discovered skills
    for (const [name, skill] of this.skills) {
      if (this.activeNames.has(name) && skill.state === 'discovered') {
        skill.state = 'active';
      }
      if (this.errorNames.has(name)) {
        skill.state = 'error';
      }
    }

    // Mark skill as discovered if it was added, but preserve active/error state
    for (const name of this.skills.keys()) {
      if (!existingNames.has(name) && !this.activeNames.has(name) && !this.errorNames.has(name)) {
        const skill = this.skills.get(name)!;
        if (skill.state === 'installed') {
          skill.state = 'installed';
        }
      }
    }

    return this.getAll();
  }

  private async scanPathForSkills(basePath: string, source: SkillSource): Promise<void> {
    for (const dirName of SKILL_DIR_NAMES) {
      const skillsDir = path.join(basePath, dirName);
      let entries: string[];
      try {
        entries = fs.readdirSync(skillsDir);
      } catch {
        continue;
      }

      for (const entry of entries) {
        const skillDir = path.join(skillsDir, entry);
        let stat: fs.Stats;
        try {
          stat = fs.statSync(skillDir);
        } catch {
          continue;
        }
        if (!stat.isDirectory()) continue;

        const skillMdPath = path.join(skillDir, 'SKILL.md');
        let raw: string;
        try {
          raw = fs.readFileSync(skillMdPath, 'utf-8');
        } catch {
          continue;
        }

        const skill = this.parseSkillByFormat(raw, skillDir, entry, source);
        if (!skill) {
          Logger.warn('SkillManager', `Invalid SKILL.md in ${skillMdPath}`);
          continue;
        }

        const refsDir = path.join(skillDir, 'references');
        try {
          const refFiles = fs.readdirSync(refsDir);
          for (const f of refFiles) {
            const refPath = path.join(refsDir, f);
            let refContent: string;
            try {
              refContent = fs.readFileSync(refPath, 'utf-8');
            } catch {
              continue;
            }
            skill.references.push({
              path: refPath,
              content: refContent,
              language: path.extname(f).slice(1) || undefined,
            });
          }
        } catch { }

        const scriptsDir = path.join(skillDir, 'scripts');
        try {
          const scriptFiles = fs.readdirSync(scriptsDir);
          for (const f of scriptFiles) {
            const scriptPath = path.join(scriptsDir, f);
            let scriptContent: string;
            try {
              scriptContent = fs.readFileSync(scriptPath, 'utf-8');
            } catch {
              continue;
            }
            skill.scripts.push({
              path: scriptPath,
              content: scriptContent,
              language: path.extname(f).slice(1) || undefined,
            });
          }
        } catch { }

        this.skills.set(skill.name, skill);
      }
    }
  }

  private parseSkillByFormat(raw: string, dir: string, name: string, source: SkillSource): Skill | null {
    const dotApexagent = dir.includes('.apexagent');
    const dotKilo = dir.includes('.kilo');
    const dotClaude = dir.includes('.claude');
    const dotCodex = dir.includes('.codex');
    const dotGithub = dir.includes('.github');
    const dotOpencode = dir.includes('.opencode');

    if (dotApexagent || dotKilo || dotOpencode) {
      return parseSkillMd(raw, dir, 'kilo', source);
    }
    if (dotClaude) {
      return parseClaudeSkill(raw, dir, source);
    }
    if (dotCodex) {
      return parseCodexSkill(raw, dir, source);
    }
    if (dotGithub) {
      return parseSkillMd(raw, dir, 'opencode', source);
    }
    return parseSkillMd(raw, dir, 'kilo', source);
  }

  async install(source: string, scope: 'project' | 'global' = 'project'): Promise<Skill> {
    const { SkillInstaller } = await import('./skill-installer');
    const installer = new SkillInstaller();
    const skill = await installer.install(source, scope);
    this.skills.set(skill.name, skill);
    await this.save();
    return skill;
  }

  async uninstall(name: string): Promise<void> {
    const skill = this.skills.get(name);
    if (!skill) throw new Error(`Skill not found: ${name}`);

    try {
      if (fs.existsSync(skill.directory)) {
        fs.rmSync(skill.directory, { recursive: true, force: true });
      }
    } catch (err: any) {
      Logger.warn('SkillManager', `Failed to remove directory for ${name}: ${err.message}`);
    }

    this.skills.delete(name);
    this.activeNames.delete(name);
    this.errorNames.delete(name);
    await this.save();
  }

  async update(name: string): Promise<Skill> {
    const skill = this.skills.get(name);
    if (!skill) throw new Error(`Skill not found: ${name}`);

    if (skill.source.type === 'git') {
      try {
        execSync(`git -C "${skill.directory}" pull --ff-only`, { timeout: 30000 });
      } catch (err: any) {
        throw new Error(`Git update failed: ${err.message}`);
      }
    }

    await this.discover();
    const updated = this.skills.get(name);
    if (!updated) throw new Error(`Skill ${name} not found after update`);
    return updated;
  }

  async search(query: string): Promise<SkillInfo[]> {
    const results: SkillInfo[] = [];
    const q = query.toLowerCase();

    for (const skill of this.skills.values()) {
      if (
        skill.name.toLowerCase().includes(q) ||
        skill.description.toLowerCase().includes(q) ||
        skill.tags.some((t) => t.toLowerCase().includes(q))
      ) {
        results.push(this.toInfo(skill));
      }
    }

    return results;
  }

  async activate(name: string): Promise<void> {
    const skill = this.skills.get(name);
    if (!skill) throw new Error(`Skill not found: ${name}`);

    const config = vscode.workspace.getConfiguration('apexagent');
    const maxActive = config.get<number>('skills.maxActive', 5);
    if (this.activeNames.size >= maxActive && !this.activeNames.has(name)) {
      throw new Error(`Maximum active skills (${maxActive}) reached`);
    }

    skill.state = 'active';
    this.activeNames.add(name);
    this.errorNames.delete(name);
    await this.save();
  }

  async deactivate(name: string): Promise<void> {
    const skill = this.skills.get(name);
    if (!skill) throw new Error(`Skill not found: ${name}`);

    if (!this.activeNames.has(name)) return;

    if (skill.state === 'active') {
      skill.state = 'installed';
    }
    this.activeNames.delete(name);
    await this.save();
  }

  setActiveSkills(names: string[]): void {
    this.activeNames = new Set(names);
    for (const [name, skill] of this.skills) {
      if (this.activeNames.has(name)) {
        skill.state = 'active';
      } else if (skill.state === 'active') {
        skill.state = 'installed';
      }
    }
  }

  getActiveSkills(): Skill[] {
    return Array.from(this.skills.values()).filter((s) => this.activeNames.has(s.name));
  }

  getInstalled(): SkillInfo[] {
    return Array.from(this.skills.values())
      .filter((s) => s.state === 'installed' || s.state === 'active')
      .map((s) => this.toInfo(s));
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  getAll(): SkillInfo[] {
    return Array.from(this.skills.values()).map((s) => this.toInfo(s));
  }

  private toInfo(skill: Skill): SkillInfo {
    return {
      name: skill.name,
      description: skill.description,
      tags: skill.tags,
      state: skill.state,
      source: skill.source.type === 'git' ? skill.source.repo : skill.source.type,
      format: skill.format,
    };
  }
}
