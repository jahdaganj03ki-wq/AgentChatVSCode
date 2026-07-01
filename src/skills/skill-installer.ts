import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { Skill, SkillSource, SkillFormat } from './types';
import { parseSkillMd } from './format-parsers/skill-md-parser';
import { Logger } from '../utils/logger';

type InstallMethod = 'npx' | 'git' | 'http';

export class SkillInstaller {
  async install(source: string, scope: 'project' | 'global' = 'project'): Promise<Skill> {
    const resolved = this.resolveSourceType(source);
    const config = vscode.workspace.getConfiguration('apexagent');
    const methods = config.get<InstallMethod[]>('skills.installMethod', ['npx', 'git', 'http']);

    let lastError: Error | null = null;

    for (const method of methods) {
      try {
        switch (method) {
          case 'npx':
            if (resolved.type === 'npx') {
              return await this.installViaNpx(resolved.package, scope);
            }
            break;
          case 'git':
            if (resolved.type === 'git' || resolved.type === 'local') {
              return await this.installViaGit(resolved.url || resolved.path, scope);
            }
            break;
          case 'http':
            if (resolved.type === 'url') {
              return await this.installViaHttp(resolved.url, scope);
            }
            break;
        }
      } catch (err: any) {
        lastError = err;
        Logger.warn('SkillInstaller', `Method ${method} failed for ${source}: ${err.message}`);
      }
    }

    throw lastError || new Error(`Failed to install skill from: ${source}`);
  }

  private resolveSourceType(source: string): { type: 'git' | 'url' | 'npx' | 'local'; url?: string; path?: string; package?: string } {
    if (source.startsWith('npx:')) {
      return { type: 'npx', package: source.slice(4) };
    }
    if (source.startsWith('@') || source.startsWith('npm:')) {
      return { type: 'npx', package: source.replace(/^npm:/, '') };
    }
    if (source.startsWith('http://') || source.startsWith('https://')) {
      const url = new URL(source);
      if (url.hostname === 'github.com' || url.hostname === 'raw.githubusercontent.com') {
        return { type: 'git', url: source };
      }
      return { type: 'url', url: source };
    }
    if (source.startsWith('./') || source.startsWith('/') || source.startsWith('~')) {
      return { type: 'local', path: source };
    }
    if (source.includes('/') && !source.startsWith('@')) {
      return { type: 'git', url: `https://github.com/${source}.git` };
    }
    return { type: 'npx', package: source };
  }

  private getTargetDir(scope: 'project' | 'global'): string {
    if (scope === 'project') {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders?.[0]) {
        return path.join(workspaceFolders[0].uri.fsPath, '.apexagent', 'skills');
      }
    }
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    return path.join(homeDir, '.apexagent', 'skills');
  }

  private async installViaNpx(pkg: string, scope: 'project' | 'global'): Promise<Skill> {
    const targetDir = this.getTargetDir(scope);
    fs.mkdirSync(targetDir, { recursive: true });

    try {
      execSync(`npx skills add "${pkg}"`, {
        cwd: targetDir,
        timeout: 60000,
        stdio: 'pipe',
      });
    } catch (err: any) {
      throw new Error(`npx install failed: ${err.message}`);
    }

    return this.findSkillInDir(targetDir, pkg, { type: 'npx', package: pkg });
  }

  private async installViaGit(url: string, scope: 'project' | 'global'): Promise<Skill> {
    const targetDir = this.getTargetDir(scope);
    fs.mkdirSync(targetDir, { recursive: true });

    const repoName = this.getRepoName(url);
    const destDir = path.join(targetDir, repoName);

    if (fs.existsSync(destDir)) {
      try {
        execSync(`git -C "${destDir}" pull --ff-only`, { timeout: 30000, stdio: 'pipe' });
      } catch (err: any) {
        throw new Error(`Git pull failed: ${err.message}`);
      }
    } else {
      try {
        execSync(`git clone --depth 1 "${url}" "${destDir}"`, { timeout: 60000, stdio: 'pipe' });
      } catch (err: any) {
        throw new Error(`Git clone failed: ${err.message}`);
      }
    }

    return this.findSkillInDir(destDir, repoName, { type: 'git', repo: url });
  }

  private async installViaHttp(url: string, scope: 'project' | 'global'): Promise<Skill> {
    const targetDir = this.getTargetDir(scope);
    fs.mkdirSync(targetDir, { recursive: true });

    const skillName = this.getHttpSkillName(url);
    const destDir = path.join(targetDir, skillName);
    fs.mkdirSync(destDir, { recursive: true });

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Skill not found at ${url}`);
    }
    const content = await response.text();

    const skillMdPath = path.join(destDir, 'SKILL.md');
    fs.writeFileSync(skillMdPath, content, 'utf-8');

    return this.findSkillInDir(destDir, skillName, { type: 'url', url });
  }

  private findSkillInDir(dir: string, nameHint: string, source: SkillSource): Skill {
    // Check both skills/<name>/ and skill/<name>/ and immediate SKILL.md
    const candidates = [dir];
    for (const sub of ['skills', 'skill']) {
      const subDir = path.join(dir, sub);
      if (fs.existsSync(subDir)) {
        try {
          const entries = fs.readdirSync(subDir);
          for (const entry of entries) {
            candidates.push(path.join(subDir, entry));
          }
        } catch { }
      }
    }

    for (const candidate of candidates) {
      const skillMdPath = path.join(candidate, 'SKILL.md');
      try {
        if (fs.existsSync(skillMdPath)) {
          const raw = fs.readFileSync(skillMdPath, 'utf-8');
          const skill = parseSkillMd(raw, candidate, 'kilo', source);
          if (skill) return skill;
        }
      } catch { }
    }

    throw new Error(`No valid SKILL.md found in ${dir}`);
  }

  private getRepoName(url: string): string {
    const match = url.match(/\/([^/]+?)(?:\.git)?$/);
    return match ? match[1] : `skill-${Date.now()}`;
  }

  private getHttpSkillName(url: string): string {
    const parts = url.split('/').filter(Boolean);
    const last = parts[parts.length - 1]?.replace(/\.md$/i, '') || `skill-${Date.now()}`;
    return last;
  }
}
