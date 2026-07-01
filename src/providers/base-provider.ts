export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface ChatChunk {
  content: string;
  finishReason?: 'stop' | 'length' | 'error' | null;
}

export interface ModelInfo {
  id: string;
  name?: string;
  provider: string;
  contextLength?: number;
}

export interface TestResult {
  success: boolean;
  latencyMs?: number;
  error?: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  enabled: boolean;
}

export abstract class BaseProvider {
  constructor(public config: ProviderConfig) {}

  abstract get providerId(): string;

  abstract chat(
    messages: ChatMessage[],
    options?: { signal?: AbortSignal; maxTokens?: number; temperature?: number }
  ): AsyncIterable<ChatChunk>;

  abstract fetchModels(): Promise<ModelInfo[]>;

  async testConnection(): Promise<TestResult> {
    const start = Date.now();
    try {
      const messages: ChatMessage[] = [{ role: 'user', content: 'Reply with exactly: OK' }];
      for await (const chunk of this.chat(messages, { maxTokens: 10 })) {
        if (chunk.content) break;
      }
      return { success: true, latencyMs: Date.now() - start };
    } catch (err: any) {
      return { success: false, latencyMs: Date.now() - start, error: err.message };
    }
  }

  updateConfig(partial: Partial<ProviderConfig>) {
    this.config = { ...this.config, ...partial };
  }
}
