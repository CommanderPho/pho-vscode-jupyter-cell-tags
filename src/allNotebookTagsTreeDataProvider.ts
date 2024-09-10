import * as vscode from 'vscode';
import { getCellTags } from './helper';  // Assuming this function fetches the tags for a cell

export class AllTagsTreeDataProvider implements vscode.TreeDataProvider<string> {
    private _onDidChangeTreeData: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event;

    private _tags: string[] = [];
    private _disposables: vscode.Disposable[] = [];
    private _editorDisposables: vscode.Disposable[] = [];

    constructor() {
        this._tags = [];

        this._disposables.push(vscode.window.onDidChangeActiveNotebookEditor(e => {
            this.registerEditorListeners(e);
        }));

        if (vscode.window.activeNotebookEditor) {
            this.registerEditorListeners(vscode.window.activeNotebookEditor);
        }
    }

    private async registerEditorListeners(editor: vscode.NotebookEditor | undefined) {
        this._editorDisposables.forEach(d => d.dispose());

        if (!editor || editor.notebook.notebookType !== 'jupyter-notebook') {
            return;
        }

        await vscode.commands.executeCommand('setContext', 'jupyter:showAllTagsExplorer', true);

        this._editorDisposables.push(vscode.workspace.onDidChangeNotebookDocument(e => {
            this.updateTags(editor);
        }));
        this.updateTags(editor);
    }

    private async updateTags(editor: vscode.NotebookEditor | undefined) {
        // Clear if no editor
        if (!editor) {
            this._tags = [];
            this._onDidChangeTreeData.fire();
            return;
        }

        this._tags = [];
        for (let i = 0; i < editor.notebook.cellCount; i++) {
            const cell = editor.notebook.cellAt(i);
            if (!cell) {
                continue;
            }
            const tags = getCellTags(cell);
            this._tags = Array.from(new Set([...this._tags, ...tags]));  // Ensure tags are unique
        }

        this._onDidChangeTreeData.fire();  // Refresh the tree view
    }

    getTreeItem(element: string): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return {
            label: element,
            collapsibleState: vscode.TreeItemCollapsibleState.None,
        };
    }

    getChildren(element?: string | undefined): vscode.ProviderResult<string[]> {
        if (!element) {
            return this._tags;
        } else {
            return [];
        }
    }

    dispose() {
        this._editorDisposables.forEach(d => d.dispose());
        this._disposables.forEach(d => d.dispose());
    }
}

export function register(context: vscode.ExtensionContext) {
    const treeDataProvider = new AllTagsTreeDataProvider();
    context.subscriptions.push(vscode.window.registerTreeDataProvider('all-notebook-tags-view', treeDataProvider));
}
