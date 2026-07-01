import * as vscode from 'vscode';
import { ChatViewProvider } from './views/webview/chat-view-provider';
import { ProviderManager } from './providers/provider-manager';
import { Logger } from './utils/logger';

let chatViewProvider: ChatViewProvider | undefined;

export function activate(context: vscode.ExtensionContext) {
  Logger.initialize();
  Logger.info('Extension', 'ApexAgent activating...');

  const providerManager = new ProviderManager(context);
  chatViewProvider = new ChatViewProvider(context, providerManager);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'apexagent.chatView',
      chatViewProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  const openChat = vscode.commands.registerCommand('apexagent.openChat', () => {
    vscode.commands.executeCommand('apexagent.chatView.focus');
  });

  const newChat = vscode.commands.registerCommand('apexagent.newChat', () => {
    chatViewProvider?.newChat();
    vscode.commands.executeCommand('apexagent.chatView.focus');
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
    vscode.commands.executeCommand('apexagent.chatView.focus');
    chatViewProvider?.sendUserMessage(selection);
  });

  const regenerate = vscode.commands.registerCommand('apexagent.regenerate', () => {
    chatViewProvider?.regenerate();
  });

  const cancel = vscode.commands.registerCommand('apexagent.cancel', () => {
    chatViewProvider?.cancelStream();
  });

  const openSettings = vscode.commands.registerCommand('apexagent.openSettings', () => {
    chatViewProvider?.openSettings();
  });

  // Skill commands
  const installSkill = vscode.commands.registerCommand('apexagent.installSkill', async () => {
    const source = await vscode.window.showInputBox({
      prompt: 'Enter skill source (GitHub repo, URL, or npm package)',
      placeHolder: 'e.g., Lombiq/Orchard-Core-Agent-Skills',
    });
    if (source) {
      chatViewProvider?.postMessage({
        type: 'install-skill',
        source,
        name: source.split('/').pop() || source,
        scope: 'project',
      } as any);
    }
  });

  const searchSkills = vscode.commands.registerCommand('apexagent.searchSkills', async () => {
    const query = await vscode.window.showInputBox({
      prompt: 'Search for skills',
      placeHolder: 'e.g., theming, python, dotnet',
    });
    if (query !== undefined) {
      chatViewProvider?.postMessage({
        type: 'search-skills',
        query: query || '',
      } as any);
    }
  });

  context.subscriptions.push(
    openChat, newChat, askSelection, regenerate, cancel, openSettings,
    installSkill, searchSkills
  );

  vscode.commands.executeCommand('setContext', 'apexagent.streaming', false);

  Logger.info('Extension', 'ApexAgent activated successfully');
}

export function deactivate() {
  Logger.info('Extension', 'ApexAgent deactivating');
  chatViewProvider?.dispose();
}
