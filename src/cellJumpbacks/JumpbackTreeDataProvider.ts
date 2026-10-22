import * as vscode from 'vscode';
import { JumpbackEntry, JumpbackDataSource, isNotebookJumpback, isTextJumpback } from './jumpbackDataSource';


export class JumpbackTreeItem extends vscode.TreeItem {
  constructor(public readonly label: string, public readonly jumpback: JumpbackEntry, public readonly targetUri: vscode.Uri) {
    super(label, vscode.TreeItemCollapsibleState.None);
    if (isNotebookJumpback(jumpback)) {
      this.tooltip = `Cell ${jumpback.cellIndex} – Added at: ${jumpback.addedAt}` + (jumpback.name ? `, ${jumpback.name}` : '');
    } else {
      const fileName = targetUri.path.split('/').pop() ?? 'file';
      this.tooltip = `${fileName}:${jumpback.line + 1}:${jumpback.character + 1} – Added at: ${jumpback.addedAt}` + (jumpback.name ? `, ${jumpback.name}` : '');
      this.description = `Line ${jumpback.line + 1}`;
    }
    this.iconPath = new vscode.ThemeIcon('bookmark');
    this.contextValue = 'jumpbackItem';
    this.command = {
      command: 'jupyter-cell-tags.openJumpback',
      title: 'Open Jumpback',
      arguments: [{ entry: jumpback, targetUri }]
    };
  }
}

export class JumpbackTreeDataProvider implements vscode.TreeDataProvider<JumpbackTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<JumpbackTreeItem | undefined | null> = new vscode.EventEmitter<JumpbackTreeItem | undefined | null>();
  readonly onDidChangeTreeData: vscode.Event<JumpbackTreeItem | undefined | null> = this._onDidChangeTreeData.event;

  private jumpbacks: JumpbackEntry[] = [];
  private targetUri: vscode.Uri | undefined;

  refresh(jumpbacks: JumpbackEntry[], targetUri?: vscode.Uri): void {
    this.jumpbacks = jumpbacks;
    this.targetUri = targetUri;
    this._onDidChangeTreeData.fire(null);
  }

  getTreeItem(element: JumpbackTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: JumpbackTreeItem): Thenable<JumpbackTreeItem[]> {
    if (!this.targetUri) {
      return Promise.resolve([]);
    }
    if (element) {
      return Promise.resolve([]);
    }
    const targetUri = this.targetUri;
    const items = this.jumpbacks.map(jb => {
      if (isNotebookJumpback(jb)) {
        return new JumpbackTreeItem(`Cell ${jb.cellIndex}` + (jb.name ? ` (${jb.name})` : ''), jb, targetUri);
      }
      if (isTextJumpback(jb)) {
        return new JumpbackTreeItem(`Line ${jb.line + 1}` + (jb.name ? ` (${jb.name})` : ''), jb, targetUri);
      }
      return new JumpbackTreeItem('Jumpback', jb, targetUri);
    });
    return Promise.resolve(items);
  }
}


export function register(context: vscode.ExtensionContext) {
    const jumpbackProvider = new JumpbackTreeDataProvider();
    context.subscriptions.push(vscode.window.registerTreeDataProvider('jumpbacks', jumpbackProvider));

    let updateJumpbackTimer: ReturnType<typeof setTimeout> | undefined;

    const doUpdateJumpbackView = () => {
        const ds = JumpbackDataSource.loadFromActiveEditor();
        if (!ds) {
            jumpbackProvider.refresh([]);
            return;
        }
        const notebook = ds.getNotebook();
        const text = ds.getTextDocument();
        const targetUri = notebook?.uri ?? text?.uri;
        jumpbackProvider.refresh(ds.getList(), targetUri);
    };

    const updateJumpbackView = (): void => {
        if (updateJumpbackTimer) {
            clearTimeout(updateJumpbackTimer);
        }
        updateJumpbackTimer = setTimeout(() => {
            updateJumpbackTimer = undefined;
            doUpdateJumpbackView();
        }, 150);
    };

    context.subscriptions.push({ dispose: () => { clearTimeout(updateJumpbackTimer); } });

    context.subscriptions.push(vscode.window.onDidChangeActiveNotebookEditor(() => doUpdateJumpbackView()));
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => doUpdateJumpbackView()));
    context.subscriptions.push(vscode.workspace.onDidChangeNotebookDocument((e) => {
        // Only notebook-level metadata changes can affect the jumpback list
        if (e.metadata === undefined) {
            return;
        }
        const active = vscode.window.activeNotebookEditor;
        if (active && e.notebook.uri.toString() === active.notebook.uri.toString()) {
            updateJumpbackView();
        }
    }));

    updateJumpbackView();

    context.subscriptions.push(
        vscode.commands.registerCommand('jupyter-cell-tags.showAllNotebookJumpbacks', () => {
            vscode.commands.executeCommand('workbench.view.explorer');
            vscode.commands.executeCommand('jumpbacks.focus');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('jupyter-cell-tags.refreshJumpbacks', () => updateJumpbackView())
    );
}
