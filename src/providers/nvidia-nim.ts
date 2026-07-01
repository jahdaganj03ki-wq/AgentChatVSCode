import { OpenAICompatibleProvider } from './openai-compatible';
import { ProviderConfig } from './base-provider';

export class NVIDIAProvider extends OpenAICompatibleProvider {
  constructor(config: Partial<ProviderConfig> = {}) {
    super({
      id: 'nvidia-nim',
      name: 'NVIDIA NIM',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      model: 'meta/llama-3.1-8b-instruct',
      maxTokens: 4096,
      temperature: 0.7,
      enabled: true,
      ...config,
    });
  }
}
