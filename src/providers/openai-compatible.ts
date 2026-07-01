import {
  BaseProvider,
  ChatMessage,
  ChatChunk,
  ModelInfo,
  ProviderConfig,
} from './base-provider';

export class OpenAICompatibleProvider extends BaseProvider {
  constructor(config: ProviderConfig) {
    super(config);
  }

  get providerId(): string {
    return this.config.id;
  }

  protected buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    return headers;
  }

  protected buildBody(
    messages: ChatMessage[],
    options?: { maxTokens?: number; temperature?: number }
  ): Record<string, unknown> {
    return {
      model: this.config.model || 'gpt-3.5-turbo',
      messages,
      stream: true,
      max_tokens: options?.maxTokens ?? this.config.maxTokens ?? 4096,
      temperature: options?.temperature ?? this.config.temperature ?? 0.7,
    };
  }

  async *chat(
    messages: ChatMessage[],
    options?: { signal?: AbortSignal; maxTokens?: number; temperature?: number }
  ): AsyncIterable<ChatChunk> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(this.buildBody(messages, options)),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw this.parseError(response.status, errorBody);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('NETWORK: No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data);
            const choice = parsed.choices?.[0];
            if (!choice) continue;

            const content = choice.delta?.content || '';
            const finishReason = choice.finish_reason || null;

            yield { content, finishReason };

            if (finishReason) return;
          } catch {
            continue;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async fetchModels(): Promise<ModelInfo[]> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}/models`;
    const response = await fetch(url, {
      headers: this.buildHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`);
    }

    const body = await response.json();
    return (body.data || []).map((m: any) => ({
      id: m.id,
      name: m.id,
      provider: this.providerId,
      contextLength: m.context_length,
    }));
  }

  protected parseError(status: number, body: string): Error {
    const typeMap: Record<number, string> = {
      401: 'AUTH_FAILED',
      403: 'AUTH_FAILED',
      429: 'RATE_LIMITED',
      503: 'MODEL_UNAVAILABLE',
    };
    const prefix = typeMap[status] || 'NETWORK';
    return new Error(`${prefix}: ${body || `HTTP ${status}`}`);
  }
}
