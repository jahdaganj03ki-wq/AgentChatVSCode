import { OpenAICompatibleProvider } from './openai-compatible';
import { ProviderConfig } from './base-provider';

export class OpenCodeZenProvider extends OpenAICompatibleProvider {
  constructor(config: Partial<ProviderConfig> = {}) {
    super({
      id: 'opencode-zen',
      name: 'OpenCode Zen',
      baseUrl: 'https://api.opencodezen.ai/v1',
      model: 'gpt-4o-mini',
      maxTokens: 4096,
      temperature: 0.7,
      enabled: true,
      ...config,
    });
  }
}
