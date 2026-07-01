import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { Logger } from '../../utils/logger';
import { SkillRegistry } from '../../skills/skill-registry';

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string, defaultValue?: any) => {
        if (key === 'skills.urls') return [];
        if (key === 'githubToken') return '';
        return defaultValue;
      }),
    })),
    onDidChangeConfiguration: vi.fn(),
  },
  window: {
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      append: vi.fn(),
      show: vi.fn(),
    })),
  },
}));

vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

describe('SkillRegistry', () => {
  let registry: SkillRegistry;

  beforeAll(() => {
    Logger.initialize();
  });

  beforeEach(() => {
    registry = new SkillRegistry();
    registry.clearCache();
  });

  describe('searchAll', () => {
    it('returns empty array when fetch fails', async () => {
      const results = await registry.searchAll('test');
      expect(results).toEqual([]);
    });
  });

  describe('searchGithub', () => {
    it('returns empty array on network failure', async () => {
      const results = await registry.searchGithub('test');
      expect(results).toEqual([]);
    });
  });

  describe('searchUrls', () => {
    it('returns empty array when no URLs configured', async () => {
      const results = await registry.searchUrls('test');
      expect(results).toEqual([]);
    });
  });

  describe('searchCommunity', () => {
    it('returns empty array (placeholder)', async () => {
      const results = await registry.searchCommunity('test');
      expect(results).toEqual([]);
    });
  });

  describe('clearCache', () => {
    it('clears without error', () => {
      registry.clearCache();
      expect(true).toBe(true);
    });
  });
});
