import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SkillInstaller } from '../../skills/skill-installer';

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string, defaultValue?: any) => {
        if (key === 'skills.installMethod') return ['npx', 'git', 'http'];
        if (key === 'skills.paths') return [];
        return defaultValue;
      }),
      workspaceFolders: [{ uri: { fsPath: '/test-workspace' } }],
    })),
    workspaceFolders: [{ uri: { fsPath: '/test-workspace' } }],
  },
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(() => '{}'),
}));

vi.mock('fs', () => {
  const store: Record<string, string> = {};
  const dirs = new Set<string>(['/test-workspace']);
  const existsSync = vi.fn((p: string) => p in store || dirs.has(p));
  return {
    existsSync,
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(() => ['SKILL.md']),
    statSync: vi.fn(() => ({ isDirectory: () => true })),
    readFileSync: vi.fn((p: string) => {
      if (p.endsWith('SKILL.md')) {
        return '---\nname: test-skill\ndescription: A test skill\ntags: [test]\n---\nContent';
      }
      if (p in store) return store[p];
      throw new Error('ENOENT');
    }),
    writeFileSync: vi.fn((p: string, d: string) => { store[p] = d; }),
  };
});

describe('SkillInstaller', () => {
  let installer: SkillInstaller;

  beforeEach(() => {
    installer = new SkillInstaller();
  });

  describe('install', () => {
    it('fails with invalid source', async () => {
      await expect(installer.install('')).rejects.toThrow();
    });
  });
});
