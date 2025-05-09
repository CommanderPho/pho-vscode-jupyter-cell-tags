import * as vscode from 'vscode';
import { JumpbackEntry, JumpbackDataSource } from './jumpbackDataSource';


export class JumpbackTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly jumpback: JumpbackEntry
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.tooltip = `Cell ${jumpback.cellIndex} – Added at: ${jumpback.addedAt}` + (jumpback.name ? `, ${jumpback.name}` : '');
    // Optionally, add an icon with a codicon (e.g. bookmark)
    this.iconPath = new vscode.ThemeIcon('bookmark');
    this.contextValue = 'jumpbackItem';
  }
}

export class JumpbackTreeDataProvider implements vscode.TreeDataProvider<JumpbackTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<JumpbackTreeItem | undefined | null> = new vscode.EventEmitter<JumpbackTreeItem | undefined | null>();
  readonly onDidChangeTreeData: vscode.Event<JumpbackTreeItem | undefined | null> = this._onDidChangeTreeData.event;

  private jumpbacks: JumpbackEntry[] = [];

  refresh(jumpbacks: JumpbackEntry[]): void {
    this.jumpbacks = jumpbacks;
    this._onDidChangeTreeData.fire(null);
  }

  getTreeItem(element: JumpbackTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: JumpbackTreeItem): Thenable<JumpbackTreeItem[]> {
    if (!vscode.window.activeNotebookEditor) {
      return Promise.resolve([]);
    }
    if (element) {
      // jumpback items have no children
      return Promise.resolve([]);
    } else {
      const items = this.jumpbacks.map(jb =>
        new JumpbackTreeItem(`Cell ${jb.cellIndex}` + (jb.name ? ` (${jb.name})` : ''), jb)
      );
      return Promise.resolve(items);
    }
  }
}





export function register(context: vscode.ExtensionContext) {
    // Register the Jumpback Tree view
    const jumpbackProvider = new JumpbackTreeDataProvider();
    // vscode.window.registerTreeDataProvider('jumpbacks', jumpbackProvider);
    context.subscriptions.push(vscode.window.registerTreeDataProvider('jumpbacks', jumpbackProvider));

    // Update view when active notebook changes or jumpbacks change.
    const updateJumpbackView = () => {
        const notebookEditor = vscode.window.activeNotebookEditor;
        if (notebookEditor) {
            const jumpbackDS = JumpbackDataSource.load(notebookEditor.notebook);
            jumpbackProvider.refresh(jumpbackDS.getList());
        } else {
            jumpbackProvider.refresh([]);
        }
    };

    vscode.window.onDidChangeActiveNotebookEditor(() => updateJumpbackView());
    // You can add additional listeners if the notebook's metadata changes.

    // Initial update.
    updateJumpbackView();

    context.subscriptions.push(
        vscode.commands.registerCommand('jupyter-cell-tags.showAllNotebookJumpbacks', () => {
            // Show the view in the explorer
            vscode.commands.executeCommand('workbench.view.explorer');
            // Focus/reveal the all-notebook-tags-view
            vscode.commands.executeCommand('jumpbacks.focus');
        })
    );

    // #TODO 2025-02-12 02:38: - [ ]     // Register a command to jump to and highlight the jumpback's cell
    // context.subscriptions.push(vscode.commands.registerCommand('jupyter-cell-tags.openNotebookCell', (cellIndex: number) => {
    //     const editor = vscode.window.activeNotebookEditor;
    //     if (editor) {
    //         const range = new vscode.NotebookRange(cellIndex, cellIndex + 1);
    //         editor.revealRange(range, vscode.NotebookEditorRevealType.Default);
    //         editor.selections = [new vscode.NotebookRange(cellIndex, cellIndex + 1)];  // Highlight the cell
    //     }
    // }));

}



