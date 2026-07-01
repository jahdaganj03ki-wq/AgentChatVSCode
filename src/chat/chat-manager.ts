import * as vscode from 'vscode';
import { BaseProvider, ChatMessage, ContentPart } from '../providers/base-provider';
import { SessionManager } from './session-manager';
import { createStreamController } from './streaming';
import { withRetry } from './retry';
import { Logger } from '../utils/logger';
import { Attachment } from '../utils/storage';
import { SkillManager } from '../skills/skill-manager';
import { SkillResolver } from '../skills/skill-resolver';

export type StreamCallback = {
  onChunk: (content: string) => void;
  onDone: (fullContent: string) => void;
  onError: (error: Error) => void;
};

export class ChatManager {
  private streamController: ReturnType<typeof createStreamController> | null = null;
  private skillManager: SkillManager | null = null;
  private skillResolver = new SkillResolver();
  private defaultSystemPrompt = 'You are a helpful AI assistant.';

  constructor(
    private sessionManager: SessionManager,
    private provider: BaseProvider
  ) {}

  setProvider(provider: BaseProvider) {
    this.provider = provider;
  }

  setSkillManager(sm: SkillManager) {
    this.skillManager = sm;
  }

  private buildSystemPromptWithSkills(basePrompt: string): string {
    if (!this.skillManager) return basePrompt;
    const activeSkills = this.skillManager.getActiveSkills();
    if (activeSkills.length === 0) return basePrompt;

    const skillBlocks = activeSkills.map((s) =>
      `--- BEGIN SKILL: ${s.name} ---\n${s.content}\n--- END SKILL: ${s.name} ---`
    ).join('\n\n');

    return `${skillBlocks}\n\n${basePrompt}`;
  }

  async sendMessage(userContent: string, callbacks: StreamCallback, attachments?: Attachment[]): Promise<void> {
    this.streamController = createStreamController();

    const session = this.sessionManager.getCurrent();
    if (!session) throw new Error('No active session');

    // Pre-processing: resolve matching skills
    if (this.skillManager) {
      const config = vscode.workspace.getConfiguration('apexagent');
      const enabled = config.get<boolean>('skills.enabled', true);
      const autoActivate = config.get<boolean>('skills.autoActivate', true);

      if (enabled && autoActivate) {
        const allSkills = this.skillManager.getAll();
        const installedSkills = allSkills
          .filter((s) => s.state === 'installed' || s.state === 'active')
          .map((s) => this.skillManager!.get(s.name)!)
          .filter(Boolean);

        const result = this.skillResolver.resolve(userContent, installedSkills);
        if (result.skills.length > 0) {
          Logger.info('ChatManager', `Auto-activating ${result.skills.length} skill(s) for prompt (confidence: ${result.confidence.toFixed(2)})`);
          for (const skill of result.skills) {
            if (!this.skillManager.getActiveSkills().some((s) => s.name === skill.name)) {
              await this.skillManager.activate(skill.name);
            }
          }
        }
      }
    }

    this.sessionManager.addMessage('user', userContent, attachments);

    const messages: ChatMessage[] = [];
    for (const msg of session.messages) {
      if (msg.role === 'system' || msg.role === 'user' || msg.role === 'assistant') {
        let content: string | ContentPart[] = msg.content;
        if (msg.attachments && msg.attachments.length > 0) {
          const parts: ContentPart[] = [{ type: 'text', text: msg.content }];
          for (const att of msg.attachments) {
            if (att.type === 'image') {
              parts.push({ type: 'image_url', image_url: { url: `data:${att.mimeType};base64,${att.data}` } });
            } else {
              const fileContent = Buffer.from(att.data, 'base64').toString('utf-8');
              parts.push({ type: 'text', text: `--- File: ${att.name} ---\n${fileContent}\n---` });
            }
          }
          content = parts;
        }
        messages.push({ role: msg.role, content });
      }
    }

    // Inject system prompt with skills
    const systemPromptIndex = messages.findIndex((m) => m.role === 'system');
    const basePrompt = session.systemPrompt || this.defaultSystemPrompt;
    const promptWithSkills = this.buildSystemPromptWithSkills(basePrompt);

    if (systemPromptIndex >= 0) {
      messages[systemPromptIndex] = { role: 'system', content: promptWithSkills };
    } else {
      messages.unshift({ role: 'system', content: promptWithSkills });
    }

    let fullContent = '';
    try {
      await withRetry(async () => {
        fullContent = '';
        for await (const chunk of this.provider.chat(messages, {
          signal: this.streamController!.signal,
        })) {
          if (chunk.content) {
            fullContent += chunk.content;
            callbacks.onChunk(chunk.content);
          }
          if (chunk.finishReason) break;
        }
      });

      this.sessionManager.addMessage('assistant', fullContent);
      callbacks.onDone(fullContent);
      Logger.info('ChatManager', `Message completed, ${fullContent.length} chars`);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        Logger.info('ChatManager', 'Stream cancelled by user');
      } else {
        Logger.error('ChatManager', `Stream error: ${err.message}`);
        callbacks.onError(err);
      }
    } finally {
      this.streamController = null;
    }
  }

  cancelStream() {
    this.streamController?.cancel();
  }

  isStreaming(): boolean {
    return this.streamController !== null;
  }
}
