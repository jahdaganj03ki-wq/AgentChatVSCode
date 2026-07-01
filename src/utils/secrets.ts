import * as vscode from 'vscode';

const SECRET_PREFIX = 'apexagent.provider';

export class Secrets {
  constructor(private secretsStorage: vscode.SecretStorage) {}

  static secretKey(providerId: string): string {
    return `${SECRET_PREFIX}.${providerId}.key`;
  }

  async getApiKey(providerId: string): Promise<string | undefined> {
    const key = Secrets.secretKey(providerId);
    const fromSecrets = await this.secretsStorage.get(key);
    if (fromSecrets) return fromSecrets;
    const config = vscode.workspace.getConfiguration('apexagent');
    const settingsKey = `provider.${providerId}.apiKey`;
    return config.get<string>(settingsKey);
  }

  async setApiKey(providerId: string, apiKey: string): Promise<void> {
    const key = Secrets.secretKey(providerId);
    await this.secretsStorage.store(key, apiKey);
  }

  async deleteApiKey(providerId: string): Promise<void> {
    const key = Secrets.secretKey(providerId);
    await this.secretsStorage.delete(key);
  }
}
