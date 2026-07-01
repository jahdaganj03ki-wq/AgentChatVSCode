import { OpenAICompatibleProvider } from './openai-compatible';
import { ProviderConfig } from './base-provider';

export class OpenRouterProvider extends OpenAICompatibleProvider {
  constructor(config: Partial<ProviderConfig> = {}) {
    super({
      id: 'openrouter',
      name: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'openai/gpt-4o-mini',
      maxTokens: 4096,
      temperature: 0.7,
      enabled: true,
      ...config,
    });
  }

  protected buildHeaders(): Record<string, string> {
    const headers = super.buildHeaders();
    headers['HTTP-Referer'] = 'https://github.com/apexagent/vscode';
    headers['X-Title'] = 'ApexAgent';
    return headers;
  }
}
