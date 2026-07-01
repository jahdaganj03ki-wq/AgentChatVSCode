import { BaseProvider, ChatMessage, ContentPart } from '../providers/base-provider';
import { SessionManager } from './session-manager';
import { createStreamController } from './streaming';
import { withRetry } from './retry';
import { Logger } from '../utils/logger';
import { Attachment } from '../utils/storage';

export type StreamCallback = {
  onChunk: (content: string) => void;
  onDone: (fullContent: string) => void;
  onError: (error: Error) => void;
};

export class ChatManager {
  private streamController: ReturnType<typeof createStreamController> | null = null;

  constructor(
    private sessionManager: SessionManager,
    private provider: BaseProvider
  ) {}

  setProvider(provider: BaseProvider) {
    this.provider = provider;
  }

  async sendMessage(userContent: string, callbacks: StreamCallback, attachments?: Attachment[]): Promise<void> {
    this.streamController = createStreamController();

    const session = this.sessionManager.getCurrent();
    if (!session) throw new Error('No active session');

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
