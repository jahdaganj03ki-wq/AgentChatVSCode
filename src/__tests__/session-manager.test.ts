import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionManager } from '../chat/session-manager';

const fsStore: Record<string, string> = {};

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn(() => 100),
    })),
  },
  SecretStorage: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn((p: string) => p in fsStore),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn((p: string, data: string) => { fsStore[p] = data; }),
  readFileSync: vi.fn((p: string) => { if (p in fsStore) return fsStore[p]; throw new Error('ENOENT'); }),
}));

vi.mock('path', () => ({
  dirname: vi.fn(() => '/tmp/test-storage'),
  join: vi.fn(() => '/tmp/test-storage/sessions.json'),
}));

describe('SessionManager', () => {
  let manager: SessionManager;
  const mockContext: any = {
    globalStorageUri: { fsPath: '/tmp/test-storage' },
  };

  beforeEach(() => {
    Object.keys(fsStore).forEach((k) => delete fsStore[k]);
    manager = new SessionManager(mockContext);
  });

  describe('createSession', () => {
    it('creates a session with given provider and model', () => {
      const session = manager.createSession('openrouter', 'gpt-4');
      expect(session.providerId).toBe('openrouter');
      expect(session.modelId).toBe('gpt-4');
      expect(session.title).toBe('New Chat');
      expect(session.messages).toHaveLength(0);
    });

    it('sets the session as current', () => {
      const session = manager.createSession('test', 'model');
      expect(manager.getCurrent()?.id).toBe(session.id);
    });
  });

  describe('addMessage', () => {
    it('adds message to current session', () => {
      manager.createSession('test', 'model');
      const msg = manager.addMessage('user', 'Hello');
      expect(msg.role).toBe('user');
      expect(msg.content).toBe('Hello');
      expect(manager.getCurrent()?.messages).toHaveLength(1);
    });

    it('auto-generates title from first message content', () => {
      manager.createSession('test', 'model');
      manager.addMessage('user', 'What is the meaning of life?');
      expect(manager.getCurrent()?.title).toBe('What is the meaning of life?');
    });

    it('truncates long titles', () => {
      manager.createSession('test', 'model');
      const longMsg = 'a'.repeat(100);
      manager.addMessage('user', longMsg);
      expect(manager.getCurrent()?.title).toHaveLength(63);
      expect(manager.getCurrent()?.title.endsWith('...')).toBe(true);
    });
  });

  describe('getAllSessions', () => {
    it('returns sessions', () => {
      manager.createSession('p1', 'm1');
      manager.addMessage('user', 'first');
      expect(manager.getAllSessions()).toHaveLength(1);
    });

    it('two sessions have distinct IDs', () => {
      const s1 = manager.createSession('p1', 'm1');
      manager.addMessage('user', 'first');
      const s2 = manager.createSession('p2', 'm2');
      expect(s1.id).not.toBe(s2.id);
    });

    it('returns multiple sessions', () => {
      const s1 = manager.createSession('p1', 'm1');
      manager.addMessage('user', 'first');
      expect(manager.getAllSessions()).toHaveLength(1);
      const s2 = manager.createSession('p2', 'm2');
      manager.addMessage('user', 'second');
      expect(manager.getAllSessions()).toHaveLength(2);
    });
  });

  describe('loadSession', () => {
    it('loads an existing session', () => {
      const s1 = manager.createSession('p1', 'm1');
      manager.addMessage('user', 'hi');
      manager.createSession('p2', 'm2');
      const loaded = manager.loadSession(s1.id);
      expect(loaded?.id).toBe(s1.id);
      expect(manager.getCurrent()?.id).toBe(s1.id);
    });
  });

  describe('deleteSession', () => {
    it('removes session from list', () => {
      const session = manager.createSession('test', 'model');
      manager.addMessage('user', 'hi');
      manager.deleteSession(session.id);
      expect(manager.getCurrent()).toBeNull();
      expect(manager.getAllSessions()).toHaveLength(0);
    });
  });

  describe('renameSession', () => {
    it('updates session title', () => {
      const session = manager.createSession('test', 'model');
      manager.renameSession(session.id, 'New Title');
      expect(manager.getCurrent()?.title).toBe('New Title');
    });
  });
});
