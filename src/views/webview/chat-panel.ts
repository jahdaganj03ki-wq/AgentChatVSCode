import * as vscode from 'vscode';
import { ProviderManager } from '../../providers/provider-manager';
import { ChatManager } from '../../chat/chat-manager';
import { SessionManager } from '../../chat/session-manager';
import { SettingsPanel } from './settings-panel';
import { Logger } from '../../utils/logger';
import { Attachment } from '../../utils/storage';
import { getMimeType } from '../../utils/mime';

export class ChatPanel {
  public static current: ChatPanel | undefined;
  private panel: vscode.WebviewPanel | undefined;
  private chatManager: ChatManager;
  private sessionManager: SessionManager;

  constructor(
    private context: vscode.ExtensionContext,
    private providerManager: ProviderManager
  ) {
    this.sessionManager = new SessionManager(context);
    const defaultProvider = providerManager.getDefault();
    this.chatManager = new ChatManager(this.sessionManager, defaultProvider);
    ChatPanel.current = this;
  }

  show() {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'apexagent.chat',
      'ApexAgent Chat',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')],
      }
    );

    this.panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'icon.png');

    const csp = [
      `default-src 'none'`,
      `style-src 'unsafe-inline' ${this.panel.webview.cspSource}`,
      `script-src 'nonce-${this.getNonce()}'`,
      `img-src data: https: ${this.panel.webview.cspSource}`,
      `font-src ${this.panel.webview.cspSource}`,
    ].join('; ');

    this.panel.webview.html = this.getHtml(csp);

    this.panel.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      undefined,
      (context as any).subscriptions
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      ChatPanel.current = undefined;
    });

    this.sessionManager.createSession(
      this.providerManager.getDefault().providerId,
      this.providerManager.getDefault().config.model || 'unknown'
    );

    this.postMessage({
      type: 'session-list',
      sessions: this.sessionManager.getAllSessions(),
    });

    this.postMessage({
      type: 'settings',
      settings: {
        providers: this.providerManager.getProviderConfigs(),
        defaultProvider: this.providerManager.getDefault().providerId,
        systemPrompt: vscode.workspace.getConfiguration('apexagent').get<string>('systemPrompt', 'You are a helpful AI assistant.'),
      },
    });

    Logger.info('ChatPanel', 'Webview panel created');
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 64; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
  }

  private getHtml(csp: string): string {
    const scriptUri = this.panel!.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'index.js')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>ApexAgent</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${this.getNonce()}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private postMessage(message: ExtensionMessage) {
    this.panel?.webview.postMessage(message);
  }

  private async handleMessage(message: WebviewMessage) {
    switch (message.type) {
      case 'pick-attachment': {
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: true,
          canSelectFiles: true,
          canSelectFolders: false,
          openLabel: 'Attach',
        });
        if (!uris) break;
        const picked: Attachment[] = [];
        for (const uri of uris) {
          const stat = await vscode.workspace.fs.stat(uri);
          if (stat.size > 10 * 1024 * 1024) continue;
          const data = await vscode.workspace.fs.readFile(uri);
          const mime = getMimeType(uri);
          picked.push({
            type: mime.startsWith('image/') ? 'image' : 'file',
            name: uri.path.split('/').pop() || '',
            mimeType: mime,
            data: Buffer.from(data).toString('base64'),
            size: stat.size,
          });
        }
        this.postMessage({ type: 'attachments-picked', attachments: picked });
        break;
      }

      case 'send-message': {
        const provider = message.providerId
          ? this.providerManager.get(message.providerId) || this.providerManager.getDefault()
          : this.providerManager.getDefault();
        this.chatManager.setProvider(provider);

        const session = this.sessionManager.getCurrent();
        if (!session) {
          this.sessionManager.createSession(
            provider.providerId,
            provider.config.model || 'unknown'
          );
        }

        if (message.systemPrompt) {
          const session = this.sessionManager.getCurrent();
          if (session) {
            session.systemPrompt = message.systemPrompt;
          }
        }

        const attachments = (message as any).attachments as Attachment[] | undefined;
        await this.chatManager.sendMessage(message.text!, {
          onChunk: (content) => {
            this.postMessage({ type: 'stream-chunk', content });
          },
          onDone: (fullContent) => {
            this.postMessage({ type: 'stream-done', content: fullContent });
            this.postMessage({ type: 'session-list', sessions: this.sessionManager.getAllSessions() });
          },
          onError: (error) => {
            this.postMessage({ type: 'stream-error', error: error.message });
          },
        }, attachments);
        break;
      }

      case 'cancel-stream': {
        this.chatManager.cancelStream();
        break;
      }

      case 'regenerate': {
        const session = this.sessionManager.getCurrent();
        if (!session || session.messages.length < 2) break;
        session.messages.pop();
        const lastUserMsg = session.messages[session.messages.length - 1];
        if (lastUserMsg?.role !== 'user') break;
        const provider = this.providerManager.getDefault();
        this.chatManager.setProvider(provider);
        await this.chatManager.sendMessage(lastUserMsg.content, {
          onChunk: (content) => this.postMessage({ type: 'stream-chunk', content }),
          onDone: (fullContent) => {
            this.postMessage({ type: 'stream-done', content: fullContent });
          },
          onError: (error) => this.postMessage({ type: 'stream-error', error: error.message }),
        });
        break;
      }

      case 'new-chat': {
        const provider = this.providerManager.getDefault();
        this.sessionManager.createSession(provider.providerId, provider.config.model || 'unknown');
        this.postMessage({ type: 'session-list', sessions: this.sessionManager.getAllSessions() });
        break;
      }

      case 'load-session': {
        this.sessionManager.loadSession(message.sessionId!);
        this.postMessage({ type: 'session-list', sessions: this.sessionManager.getAllSessions() });
        const session = this.sessionManager.getCurrent();
        if (session) {
          this.postMessage({ type: 'messages-load', messages: session.messages });
        }
        break;
      }

      case 'save-settings': {
        if (message.apiKey) {
          await this.providerManager.updateApiKey(message.providerId!, message.apiKey);
        }
        break;
      }

      case 'test-connection': {
        const provider = this.providerManager.get(message.providerId!);
        if (!provider) break;
        const result = await provider.testConnection();
        this.postMessage({ type: 'test-result', result });
        break;
      }
    }
  }

  newChat() {
    const provider = this.providerManager.getDefault();
    this.sessionManager.createSession(provider.providerId, provider.config.model || 'unknown');
    this.postMessage({ type: 'session-list', sessions: this.sessionManager.getAllSessions() });
  }

  sendUserMessage(text: string) {
    this.postMessage({ type: 'send-text', text });
  }

  regenerate() {
    const session = this.sessionManager.getCurrent();
    if (!session || session.messages.length < 2) return;
    const lastAssistantMsg = session.messages[session.messages.length - 1];
    if (!lastAssistantMsg || lastAssistantMsg.role !== 'assistant') return;
    session.messages.pop();
    const provider = this.providerManager.getDefault();
    this.chatManager.setProvider(provider);
    const lastUserMsg = session.messages[session.messages.length - 1];
    if (!lastUserMsg || lastUserMsg.role !== 'user') return;
    this.chatManager.sendMessage(lastUserMsg.content, {
      onChunk: (content) => this.postMessage({ type: 'stream-chunk', content }),
      onDone: (fullContent) => this.postMessage({ type: 'stream-done', content: fullContent }),
      onError: (error) => this.postMessage({ type: 'stream-error', error: error.message }),
    });
  }

  cancelStream() {
    this.chatManager.cancelStream();
  }

  private settingsPanel: SettingsPanel | undefined;

  openSettings() {
    if (!this.settingsPanel) {
      this.settingsPanel = new SettingsPanel(this.context, this.providerManager);
    }
    this.settingsPanel.show();
  }

  dispose() {
    this.panel?.dispose();
  }
}

interface ExtensionMessage {
  type: 'stream-chunk' | 'stream-done' | 'stream-error' | 'model-list' | 'session-list' | 'settings' | 'messages-load' | 'test-result' | 'send-text' | 'attachments-picked';
  content?: string;
  error?: string;
  sessions?: any[];
  settings?: any;
  messages?: any[];
  result?: any;
  text?: string;
  attachments?: Attachment[];
}

interface WebviewMessage {
  type: 'send-message' | 'cancel-stream' | 'regenerate' | 'new-chat' | 'load-session' | 'save-settings' | 'test-connection' | 'pick-attachment';
  text?: string;
  providerId?: string;
  sessionId?: string;
  apiKey?: string;
  systemPrompt?: string;
}
