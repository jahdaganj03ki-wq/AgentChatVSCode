export type SkillFormat = 'kilo' | 'codex' | 'claude' | 'zcode' | 'opencode';
export type SkillState = 'discovered' | 'installed' | 'active' | 'error';

export interface SkillFile {
  path: string;
  content: string;
  language?: string;
}

export type SkillSource =
  | { type: 'local'; path: string }
  | { type: 'git'; repo: string; ref?: string }
  | { type: 'url'; url: string }
  | { type: 'npx'; package: string };

export interface Skill {
  name: string;
  description: string;
  format: SkillFormat;
  tags: string[];
  content: string;
  references: SkillFile[];
  scripts: SkillFile[];
  directory: string;
  source: SkillSource;
  state: SkillState;
  installedAt: string;
  metadata: { author?: string; version?: string; license?: string };
}

export interface SkillInfo {
  name: string;
  description: string;
  tags: string[];
  state: SkillState;
  source?: string;
  format?: SkillFormat;
}
