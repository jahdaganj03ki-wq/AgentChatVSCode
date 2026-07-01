import { Skill, SkillFormat, SkillSource } from '../types';
import { parseSkillMd } from './skill-md-parser';

const CLAUDE_PATTERNS = ['CLAUDE.md', 'CLAUDE/**/*.md', '.claude/CLAUDE.md'];

export function isClaudeSkill(path: string, files: string[]): boolean {
  return CLAUDE_PATTERNS.some((p) => {
    const parts = p.split('/');
    return files.some((f) => {
      const fParts = f.split('/');
      return fParts.length >= parts.length && parts.every((part, i) => part === '*' || part === fParts[i]);
    });
  });
}

export function parseClaudeSkill(
  raw: string,
  directory: string,
  source: SkillSource
): Skill | null {
  const parsed = parseSkillMd(raw, directory, 'claude', source);
  if (!parsed) return null;
  return {
    ...parsed,
    format: 'claude' as SkillFormat,
    directory,
    source,
    state: 'discovered' as const,
    installedAt: new Date().toISOString(),
  };
}
