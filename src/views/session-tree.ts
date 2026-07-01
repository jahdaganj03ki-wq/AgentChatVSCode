import * as vscode from 'vscode';
import { SessionStorage, Session } from '../utils/storage';

export class SessionTreeProvider implements vscode.TreeDataProvider<SessionItem> {
  private storage: SessionStorage;
  private _onDidChangeTreeData = new vscode.EventEmitter<SessionItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(context: vscode.ExtensionContext) {
    this.storage = new SessionStorage(context);
  }

  refresh() {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: SessionItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SessionItem): Thenable<SessionItem[]> {
    if (element) {
      return Promise.resolve([]);
    }
    const sessions = this.storage.getAll();
    const groups = this.groupSessions(sessions);
    const items: SessionItem[] = [];

    const labels: Array<{ label: string; sessions: Session[] }> = [
      { label: 'Today', sessions: groups.today },
      { label: 'Yesterday', sessions: groups.yesterday },
      { label: 'Older', sessions: groups.older },
    ];

    for (const group of labels) {
      if (group.sessions.length === 0) continue;
      items.push(new SessionItem(
        group.label,
        group.sessions.length.toString(),
        vscode.TreeItemCollapsibleState.None,
        { isGroup: true }
      ));
      for (const session of group.sessions) {
        const item = new SessionItem(
          session.title || 'Untitled',
          `${session.messages.length} msgs`,
          vscode.TreeItemCollapsibleState.None,
          { id: session.id }
        );
        item.command = {
          command: 'apexagent.openChat',
          title: 'Open Session',
          arguments: [session.id],
        };
        items.push(item);
      }
    }

    return Promise.resolve(items);
  }

  private groupSessions(sessions: Session[]) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groups: { today: Session[]; yesterday: Session[]; older: Session[] } = {
      today: [],
      yesterday: [],
      older: [],
    };

    for (const session of sessions) {
      const updated = new Date(session.updatedAt);
      if (updated >= today) {
        groups.today.push(session);
      } else if (updated >= yesterday) {
        groups.yesterday.push(session);
      } else {
        groups.older.push(session);
      }
    }

    return groups;
  }
}

class SessionItem extends vscode.TreeItem {
  constructor(
    label: string,
    description: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public sessionData: { id?: string; isGroup?: boolean }
  ) {
    super(label, collapsibleState);
    this.description = description;
    this.contextValue = sessionData.isGroup ? 'sessionGroup' : 'session';
  }
}
