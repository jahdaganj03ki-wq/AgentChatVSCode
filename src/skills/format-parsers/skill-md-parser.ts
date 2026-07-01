import { Skill, SkillFormat, SkillSource } from '../types';

export interface ParsedSkill {
  name: string;
  description: string;
  tags: string[];
  content: string;
  metadata: { author?: string; version?: string; license?: string };
}

export function parseSkillMd(
  raw: string,
  directory: string,
  format: SkillFormat,
  source: SkillSource
): Skill | null {
  const parsed = parseFrontmatter(raw);
  if (!parsed) return null;
  if (!parsed.name || !parsed.description) return null;

  return {
    name: parsed.name,
    description: parsed.description,
    format,
    tags: parsed.tags || [],
    content: parsed.content,
    references: [],
    scripts: [],
    directory,
    source,
    state: 'discovered',
    installedAt: new Date().toISOString(),
    metadata: parsed.metadata || {},
  };
}

export function parseFrontmatter(raw: string): ParsedSkill | null {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;

  const frontmatterStr = match[1];
  const body = match[2]?.trim() || '';
  const frontmatter = parseYaml(frontmatterStr);

  const name = frontmatter.name || '';
  const description = frontmatter.description || '';
  const tags: string[] = frontmatter.tags || [];
  const metadata = {
    author: frontmatter.metadata?.author,
    version: frontmatter.metadata?.version,
    license: frontmatter.license,
  };

  return { name, description, tags, content: body, metadata };
}

function parseYaml(str: string): Record<string, any> {
  const result: Record<string, any> = {};
  let currentKey = '';
  let currentValue: any = '';
  let inMeta = false;
  let metaKey = '';

  for (const line of str.split('\n')) {
    if (line.startsWith('metadata:')) {
      inMeta = true;
      result.metadata = {};
      continue;
    }
    if (inMeta) {
      const metaMatch = line.match(/^\s{2}(\w+):\s+"?(.+?)"?$/);
      if (metaMatch) {
        result.metadata[metaMatch[1]] = metaMatch[2].replace(/^"|"$/g, '');
        continue;
      } else {
        inMeta = false;
      }
    }
    const pair = line.match(/^(\w+):\s+(.+)$/);
    if (pair) {
      currentKey = pair[1];
      let val: any = pair[2].replace(/^"|"$/g, '');
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map((s: string) => s.trim().replace(/^"|"$/g, ''));
      }
      result[currentKey] = val;
    }
  }

  return result;
}
