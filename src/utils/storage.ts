import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface Attachment {
  type: 'image' | 'file';
  name: string;
  mimeType: string;
  data: string;
  size: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: Attachment[];
  createdAt: string;
  tokens?: number;
}

export interface Session {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  providerId: string;
  modelId: string;
  systemPrompt?: string;
  messages: Message[];
  tokenCount: number;
}

export class SessionStorage {
  private filePath: string;
  private sessions: Session[] = [];
  private maxSessions: number = 100;

  constructor(context: vscode.ExtensionContext) {
    this.filePath = path.join(context.globalStorageUri.fsPath, 'sessions.json');
    this.ensureDir();
    this.load();
  }

  private ensureDir() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.sessions = JSON.parse(raw);
      }
    } catch {
      this.sessions = [];
    }
  }

  private save() {
    const config = vscode.workspace.getConfiguration('apexagent');
    this.maxSessions = config.get<number>('sessionLimit', 100);
    if (this.sessions.length > this.maxSessions) {
      this.sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      this.sessions = this.sessions.slice(0, this.maxSessions);
    }
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.sessions, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save sessions:', err);
    }
  }

  getAll(): Session[] {
    return this.sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(id: string): Session | undefined {
    return this.sessions.find((s) => s.id === id);
  }

  upsert(session: Session) {
    const idx = this.sessions.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
      this.sessions[idx] = session;
    } else {
      this.sessions.push(session);
    }
    this.save();
  }

  delete(id: string) {
    this.sessions = this.sessions.filter((s) => s.id !== id);
    this.save();
  }

  updateTitle(id: string, title: string) {
    const session = this.get(id);
    if (session) {
      session.title = title;
      session.updatedAt = new Date().toISOString();
      this.save();
    }
  }
}
