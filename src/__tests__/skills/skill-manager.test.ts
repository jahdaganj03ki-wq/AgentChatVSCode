import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string, defaultValue?: any) => {
        if (key === 'skills.paths') return [];
        if (key === 'skills.maxActive') return 5;
        return defaultValue;
      }),
    })),
    workspaceFolders: [{ uri: { fsPath: '/test-workspace' } }],
  },
  SecretStorage: vi.fn(),
}));

vi.mock('fs', () => {
  const store: Record<string, string> = {};
  const dirs = new Set<string>(['/test-workspace', '/tmp']);
  const existsSync = vi.fn((p: string) => p in store || dirs.has(p));
  return {
    existsSync,
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    statSync: vi.fn((p: string) => ({ isDirectory: () => true })),
    readFileSync: vi.fn((p: string) => { if (p in store) return store[p]; throw new Error('ENOENT'); }),
    writeFileSync: vi.fn((p: string, d: string) => { store[p] = d; }),
    rmSync: vi.fn(),
    default: { existsSync: vi.fn() },
  };
});

vi.mock('path', () => ({
  join: (...parts: string[]) => parts.join('/'),
  dirname: (p: string) => p.split('/').slice(0, -1).join('/') || '/',
  extname: (p: string) => { const i = p.lastIndexOf('.'); return i >= 0 ? p.slice(i) : ''; },
}));

import { SkillManager } from '../../skills/skill-manager';

describe('SkillManager', () => {
  let manager: SkillManager;
  const mockContext: any = {
    globalState: {
      get: vi.fn(() => null),
      update: vi.fn(),
    },
  };

  beforeEach(() => {
    manager = new SkillManager(mockContext);
  });

  describe('initialize', () => {
    it('loads persisted state and discovers skills', async () => {
      await manager.initialize();
      expect(mockContext.globalState.get).toHaveBeenCalledWith('apexagent.skills');
    });
  });

  describe('getAll', () => {
    it('returns empty array initially', () => {
      expect(manager.getAll()).toEqual([]);
    });
  });

  describe('getActiveSkills', () => {
    it('returns empty array initially', () => {
      expect(manager.getActiveSkills()).toEqual([]);
    });
  });

  describe('getInstalled', () => {
    it('returns empty array initially', () => {
      expect(manager.getInstalled()).toEqual([]);
    });
  });

  describe('search', () => {
    it('returns empty array when no skills registered', async () => {
      const results = await manager.search('anything');
      expect(results).toEqual([]);
    });
  });

  describe('activate/deactivate', () => {
    it('throws when activating unknown skill', async () => {
      await expect(manager.activate('unknown')).rejects.toThrow('Skill not found');
    });

    it('throws when deactivating unknown skill', async () => {
      await expect(manager.deactivate('unknown')).rejects.toThrow('Skill not found');
    });
  });

  describe('uninstall', () => {
    it('throws when uninstalling unknown skill', async () => {
      await expect(manager.uninstall('unknown')).rejects.toThrow('Skill not found');
    });
  });

  describe('update', () => {
    it('throws when updating unknown skill', async () => {
      await expect(manager.update('unknown')).rejects.toThrow('Skill not found');
    });
  });

  describe('setActiveSkills', () => {
    it('handles empty array', () => {
      manager.setActiveSkills([]);
      expect(manager.getActiveSkills()).toEqual([]);
    });
  });
});
