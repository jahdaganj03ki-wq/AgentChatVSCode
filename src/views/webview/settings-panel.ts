import * as vscode from 'vscode';
import { ProviderManager } from '../../providers/provider-manager';
import { Logger } from '../../utils/logger';

export class SettingsPanel {
  public static current: SettingsPanel | undefined;
  private panel: vscode.WebviewPanel | undefined;

  constructor(
    private context: vscode.ExtensionContext,
    private providerManager: ProviderManager
  ) {}

  show() {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'apexagent.settings',
      'ApexAgent Settings',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')],
      }
    );

    const csp = [
      `default-src 'none'`,
      `style-src 'unsafe-inline' ${this.panel.webview.cspSource}`,
      `script-src 'nonce-${this.getNonce()}'`,
    ].join('; ');

    this.panel.webview.html = this.getHtml(csp);

    this.panel.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      undefined,
      (this.context as any).subscriptions
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      SettingsPanel.current = undefined;
    });

    this.postMessage({
      type: 'settings',
      settings: {
        providers: this.providerManager.getProviderConfigs(),
        defaultProvider: this.providerManager.getDefault().providerId,
        systemPrompt: vscode.workspace.getConfiguration('apexagent').get<string>('systemPrompt', ''),
        sessionLimit: vscode.workspace.getConfiguration('apexagent').get<number>('sessionLimit', 100),
        logLevel: vscode.workspace.getConfiguration('apexagent').get<string>('logLevel', 'info'),
      },
    });
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 64; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
  }

  private getHtml(csp: string): string {
    const scriptUri = this.panel!.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'settings.js')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>ApexAgent Settings</title>
</head>
<body>
  <div id="settings-root"></div>
  <script nonce="${this.getNonce()}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private postMessage(message: any) {
    this.panel?.webview.postMessage(message);
  }

  private async handleMessage(message: any) {
    switch (message.type) {
      case 'save-api-key': {
        await this.providerManager.updateApiKey(message.providerId, message.apiKey);
        Logger.info('SettingsPanel', `API key saved for ${message.providerId}`);
        break;
      }
      case 'update-settings': {
        const config = vscode.workspace.getConfiguration('apexagent');
        if (message.systemPrompt !== undefined) {
          await config.update('systemPrompt', message.systemPrompt, vscode.ConfigurationTarget.Global);
        }
        if (message.defaultProvider !== undefined) {
          this.providerManager.setDefault(message.defaultProvider);
        }
        if (message.sessionLimit !== undefined) {
          await config.update('sessionLimit', message.sessionLimit, vscode.ConfigurationTarget.Global);
        }
        if (message.logLevel !== undefined) {
          await config.update('logLevel', message.logLevel, vscode.ConfigurationTarget.Global);
        }
        break;
      }
      case 'test-connection': {
        const provider = this.providerManager.get(message.providerId);
        if (!provider) break;
        const result = await provider.testConnection();
        this.postMessage({ type: 'test-result', result, providerId: message.providerId });
        break;
      }
      case 'fetch-models': {
        const provider = this.providerManager.get(message.providerId);
        if (!provider) break;
        try {
          const models = await provider.fetchModels();
          this.postMessage({ type: 'model-list', models, providerId: message.providerId });
        } catch (err: any) {
          this.postMessage({ type: 'model-list', models: [], providerId: message.providerId, error: err.message });
        }
        break;
      }
    }
  }
}
