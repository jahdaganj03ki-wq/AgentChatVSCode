import * as vscode from 'vscode';
import { ProviderManager } from '../../providers/provider-manager';
import { ChatManager } from '../../chat/chat-manager';
import { SessionManager } from '../../chat/session-manager';
import { SettingsPanel } from './settings-panel';
import { Logger } from '../../utils/logger';
import { Attachment } from '../../utils/storage';
import { getMimeType } from '../../utils/mime';
import { SkillManager } from '../../skills/skill-manager';
import { SkillRegistry } from '../../skills/skill-registry';
import { SkillInfo } from '../../skills/types';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static current: ChatViewProvider | undefined;
  private view: vscode.WebviewView | undefined;
  private chatManager: ChatManager;
  private sessionManager: SessionManager;
  private settingsPanel: SettingsPanel | undefined;
  private skillManager: SkillManager;
  private skillRegistry: SkillRegistry;

  constructor(
    private context: vscode.ExtensionContext,
    private providerManager: ProviderManager
  ) {
    this.sessionManager = new SessionManager(context);
    this.skillManager = new SkillManager(context);
    this.skillRegistry = new SkillRegistry();
    const defaultProvider = providerManager.getDefault();
    this.chatManager = new ChatManager(this.sessionManager, defaultProvider);
    this.chatManager.setSkillManager(this.skillManager);
    ChatViewProvider.current = this;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this.view = webviewView;

    const nonce = this.getNonce();
    const csp = [
      `default-src 'none'`,
      `style-src 'unsafe-inline' ${webviewView.webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
      `img-src data: https: ${webviewView.webview.cspSource}`,
      `font-src ${webviewView.webview.cspSource}`,
    ].join('; ');

    webviewView.webview.html = this.getHtml(webviewView.webview, csp, nonce);

    webviewView.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      undefined,
      (this.context as any).subscriptions
    );

    webviewView.onDidDispose(() => {
      this.view = undefined;
      ChatViewProvider.current = undefined;
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

    // Initialize skills
    this.skillManager.initialize().then(() => {
      this.postMessage({
        type: 'skill-list',
        skills: this.skillManager.getAll(),
      });
    });

    Logger.info('ChatViewProvider', 'Webview view resolved');
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 64; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
  }

  private getHtml(webview: vscode.Webview, csp: string, nonce: string): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'index.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'index.css')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <link rel="stylesheet" href="${styleUri}">
  <title>ApexAgent</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  postMessage(message: ExtensionMessage) {
    this.view?.webview.postMessage(message);
  }

  private async handleMessage(message: WebviewMessage) {
    switch (message.type) {
      case 'set-provider': {
        if (message.providerId) {
          this.providerManager.setDefault(message.providerId);
        }
        break;
      }

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

      case 'list-skills': {
        this.postMessage({ type: 'skill-list', skills: this.skillManager.getAll() });
        break;
      }

      case 'install-skill': {
        const name = message.name!;
        const source = message.source!;
        const scope = message.scope || 'project';
        try {
          this.postMessage({ type: 'skill-install-progress', name, status: 'downloading' });
          await this.skillManager.install(source, scope);
          this.postMessage({ type: 'skill-installed', skill: { name } as any });
          this.postMessage({ type: 'skill-list', skills: this.skillManager.getAll() });
        } catch (err: any) {
          this.postMessage({ type: 'skill-install-progress', name, status: 'error', message: err.message });
        }
        break;
      }

      case 'uninstall-skill': {
        try {
          await this.skillManager.uninstall(message.name!);
          this.postMessage({ type: 'skill-list', skills: this.skillManager.getAll() });
        } catch (err: any) {
          Logger.error('ChatViewProvider', `Uninstall failed: ${err.message}`);
        }
        break;
      }

      case 'activate-skill': {
        try {
          for (const name of message.names!) {
            await this.skillManager.activate(name);
          }
          this.postMessage({ type: 'skill-activated', names: message.names! });
          this.postMessage({ type: 'skill-list', skills: this.skillManager.getAll() });
        } catch (err: any) {
          Logger.error('ChatViewProvider', `Activate failed: ${err.message}`);
        }
        break;
      }

      case 'deactivate-skill': {
        try {
          for (const name of message.names!) {
            await this.skillManager.deactivate(name);
          }
          this.postMessage({ type: 'skill-list', skills: this.skillManager.getAll() });
        } catch (err: any) {
          Logger.error('ChatViewProvider', `Deactivate failed: ${err.message}`);
        }
        break;
      }

      case 'search-skills': {
        try {
          const results = await this.skillRegistry.searchAll(message.query || '');
          this.postMessage({ type: 'skill-search-results', skills: results });
        } catch (err: any) {
          Logger.error('ChatViewProvider', `Search failed: ${err.message}`);
        }
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

  openSettings() {
    if (!this.settingsPanel) {
      this.settingsPanel = new SettingsPanel(this.context, this.providerManager);
    }
    this.settingsPanel.show();
  }

  dispose() {
    if (this.view) {
      (this.view as any).dispose();
    }
  }
}

interface ExtensionMessage {
  type: 'stream-chunk' | 'stream-done' | 'stream-error' | 'model-list' | 'session-list' | 'settings' | 'messages-load' | 'test-result' | 'send-text' | 'attachments-picked' | 'skill-list' | 'skill-installed' | 'skill-activated' | 'skill-install-progress' | 'skill-search-results';
  content?: string;
  error?: string;
  sessions?: any[];
  settings?: any;
  messages?: any[];
  result?: any;
  text?: string;
  attachments?: Attachment[];
  skills?: any[];
  skill?: any;
  name?: string;
  status?: string;
  message?: string;
  names?: string[];
}

interface WebviewMessage {
  type: 'send-message' | 'cancel-stream' | 'regenerate' | 'new-chat' | 'load-session' | 'save-settings' | 'test-connection' | 'pick-attachment' | 'set-provider' | 'list-skills' | 'install-skill' | 'uninstall-skill' | 'activate-skill' | 'deactivate-skill' | 'search-skills';
  text?: string;
  providerId?: string;
  sessionId?: string;
  apiKey?: string;
  systemPrompt?: string;
  name?: string;
  source?: string;
  scope?: 'project' | 'global';
  names?: string[];
  query?: string;
}
