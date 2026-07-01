import * as vscode from 'vscode';
import { ChatPanel } from './views/webview/chat-panel';
import { SessionTreeProvider } from './views/session-tree';
import { ProviderManager } from './providers/provider-manager';
import { Logger } from './utils/logger';

let chatPanel: ChatPanel | undefined;
let sessionTreeProvider: SessionTreeProvider | undefined;

export function activate(context: vscode.ExtensionContext) {
  Logger.initialize();
  Logger.info('Extension', 'ApexAgent activating...');

  const providerManager = new ProviderManager(context);
  sessionTreeProvider = new SessionTreeProvider(context);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('apexagent-sessions', sessionTreeProvider)
  );

  const openChat = vscode.commands.registerCommand('apexagent.openChat', () => {
    if (!chatPanel) {
      chatPanel = new ChatPanel(context, providerManager);
    }
    chatPanel.show();
  });

  const newChat = vscode.commands.registerCommand('apexagent.newChat', () => {
    if (chatPanel) {
      chatPanel.newChat();
    } else {
      chatPanel = new ChatPanel(context, providerManager);
      chatPanel.show();
    }
  });

  const askSelection = vscode.commands.registerCommand('apexagent.askSelection', () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('No active editor');
      return;
    }
    const selection = editor.document.getText(editor.selection);
    if (!selection) {
      vscode.window.showInformationMessage('No text selected');
      return;
    }
    if (!chatPanel) {
      chatPanel = new ChatPanel(context, providerManager);
    }
    chatPanel.show();
    chatPanel.sendUserMessage(selection);
  });

  const regenerate = vscode.commands.registerCommand('apexagent.regenerate', () => {
    chatPanel?.regenerate();
  });

  const cancel = vscode.commands.registerCommand('apexagent.cancel', () => {
    chatPanel?.cancelStream();
  });

  const openSettings = vscode.commands.registerCommand('apexagent.openSettings', () => {
    chatPanel?.openSettings();
  });

  context.subscriptions.push(
    openChat, newChat, askSelection, regenerate, cancel, openSettings
  );

  vscode.commands.executeCommand('setContext', 'apexagent.streaming', false);

  Logger.info('Extension', 'ApexAgent activated successfully');
}

export function deactivate() {
  Logger.info('Extension', 'ApexAgent deactivating');
  chatPanel?.dispose();
}
