import { Skill, SkillFormat, SkillSource } from '../types';
import { parseSkillMd } from './skill-md-parser';

export function parseZCodeSkill(
  raw: string,
  directory: string,
  source: SkillSource
): Skill | null {
  const parsed = parseSkillMd(raw);
  if (!parsed) return null;
  return {
    ...parsed,
    format: 'zcode' as SkillFormat,
    directory,
    source,
    state: 'discovered' as const,
    installedAt: new Date().toISOString(),
  };
}
