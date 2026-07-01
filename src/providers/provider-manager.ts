import * as vscode from 'vscode';
import { BaseProvider, ProviderConfig } from './base-provider';
import { OpenRouterProvider } from './openrouter';
import { NVIDIAProvider } from './nvidia-nim';
import { OpenCodeZenProvider } from './opencode-zen';
import { PuterProvider } from './puter';
import { Secrets } from '../utils/secrets';
import { Logger } from '../utils/logger';

export class ProviderManager {
  private providers: Map<string, BaseProvider> = new Map();
  private secrets: Secrets;
  private defaultProviderId: string = 'openrouter';
  private _ready: Promise<void>;

  constructor(private context: vscode.ExtensionContext) {
    this.secrets = new Secrets(context.secrets);
    this.initializeDefaults();
    this._ready = this.loadConfig();
  }

  get ready(): Promise<void> {
    return this._ready;
  }

  private initializeDefaults() {
    this.register(new OpenRouterProvider());
    this.register(new NVIDIAProvider());
    this.register(new OpenCodeZenProvider());
    this.register(new PuterProvider());
  }

  private async loadConfig() {
    const config = vscode.workspace.getConfiguration('apexagent');
    this.defaultProviderId = config.get<string>('defaultProvider', 'openrouter');
    for (const [id, provider] of this.providers) {
      const apiKey = await this.secrets.getApiKey(id);
      if (apiKey) {
        provider.updateConfig({ apiKey });
      }
    }
    Logger.info('ProviderManager', `Loaded ${this.providers.size} providers`);
  }

  register(provider: BaseProvider) {
    this.providers.set(provider.providerId, provider);
  }

  get(id: string): BaseProvider | undefined {
    return this.providers.get(id);
  }

  getAll(): BaseProvider[] {
    return Array.from(this.providers.values());
  }

  getDefault(): BaseProvider {
    return this.providers.get(this.defaultProviderId) || this.providers.values().next().value!;
  }

  setDefault(id: string) {
    this.defaultProviderId = id;
    const config = vscode.workspace.getConfiguration('apexagent');
    config.update('defaultProvider', id, vscode.ConfigurationTarget.Global);
  }

  async updateApiKey(providerId: string, apiKey: string) {
    await this.secrets.setApiKey(providerId, apiKey);
    const provider = this.get(providerId);
    if (provider) {
      provider.updateConfig({ apiKey });
    }
  }

  remove(providerId: string) {
    this.providers.delete(providerId);
  }

  getProviderConfigs(): ProviderConfig[] {
    return Array.from(this.providers.values()).map((p) => p.config);
  }
}
