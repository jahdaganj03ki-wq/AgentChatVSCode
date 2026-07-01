import { OpenAICompatibleProvider } from './openai-compatible';
import { ProviderConfig } from './base-provider';

export class PuterProvider extends OpenAICompatibleProvider {
  constructor(config: Partial<ProviderConfig> = {}) {
    super({
      id: 'puter',
      name: 'Puter.js',
      baseUrl: 'https://api.puter.com/v1',
      model: 'gpt-4o-mini',
      maxTokens: 4096,
      temperature: 0.7,
      enabled: true,
      ...config,
    });
  }
}
