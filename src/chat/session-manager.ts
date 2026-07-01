import * as vscode from 'vscode';
import { SessionStorage, Session, Message } from '../utils/storage';

let idCounter = 0;
function generateId(): string {
  return `msg_${Date.now()}_${++idCounter}`;
}

export class SessionManager {
  private storage: SessionStorage;
  private currentSession: Session | null = null;

  constructor(context: vscode.ExtensionContext) {
    this.storage = new SessionStorage(context);
  }

  getCurrent(): Session | null {
    return this.currentSession;
  }

  createSession(providerId: string, modelId: string, systemPrompt?: string): Session {
    const now = new Date().toISOString();
    this.currentSession = {
      id: `session_${Date.now()}_${++idCounter}`,
      title: 'New Chat',
      createdAt: now,
      updatedAt: now,
      providerId,
      modelId,
      systemPrompt,
      messages: [],
      tokenCount: 0,
    };
    return this.currentSession;
  }

  addMessage(role: Message['role'], content: string, attachments?: Message['attachments']): Message {
    if (!this.currentSession) throw new Error('No active session');
    const msg: Message = {
      id: generateId(),
      role,
      content,
      attachments,
      createdAt: new Date().toISOString(),
    };
    this.currentSession.messages.push(msg);
    this.currentSession.updatedAt = new Date().toISOString();
    this.currentSession.tokenCount += content.length;
    if (this.currentSession.messages.length === 1 && this.currentSession.title === 'New Chat') {
      this.currentSession.title = content.slice(0, 60) + (content.length > 60 ? '...' : '');
    }
    this.storage.upsert(this.currentSession);
    return msg;
  }

  getAllSessions(): Session[] {
    return this.storage.getAll();
  }

  loadSession(id: string): Session | undefined {
    const session = this.storage.get(id);
    if (session) {
      this.currentSession = session;
    }
    return session;
  }

  deleteSession(id: string) {
    this.storage.delete(id);
    if (this.currentSession?.id === id) {
      this.currentSession = null;
    }
  }

  renameSession(id: string, title: string) {
    this.storage.updateTitle(id, title);
    if (this.currentSession?.id === id) {
      this.currentSession.title = title;
    }
  }
}
