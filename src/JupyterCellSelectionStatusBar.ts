import * as vscode from 'vscode';

export class JupyterCellSelectionStatusBar {
    private statusBarItem: vscode.StatusBarItem;
    private disposables: vscode.Disposable[] = [];

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
        this.registerEventListeners();
        this.updateStatusBar();
        this.statusBarItem.show();
    }

    private registerEventListeners(): void {
        // Listen for changes in the active notebook editor.
        this.disposables.push(
            vscode.window.onDidChangeActiveNotebookEditor(() => this.updateStatusBar())
        );

        // Listen for changes in the notebook selection.
        this.disposables.push(
            vscode.window.onDidChangeNotebookEditorSelection(() => this.updateStatusBar())
        );
    }

    private updateStatusBar(): void {
        const activeNotebookEditor = vscode.window.activeNotebookEditor;

        if (activeNotebookEditor && activeNotebookEditor.selections && activeNotebookEditor.selections.length > 0) {
            // Assume each cell has an "index" property so we use that as the cell identifier.
            // const cellIds = activeNotebookEditor.selections.map(cell => cell.index).join(', ');
            const cellIds = activeNotebookEditor.selections.map(range => range.start).join(', ');
            this.statusBarItem.text = `Selected Notebook Cells: ${cellIds}`;
            this.statusBarItem.tooltip = 'Current Notebook Cell(s)';
        } else {
            this.statusBarItem.text = 'No Notebook Cell Selected';
            this.statusBarItem.tooltip = 'No active notebook cell selection';
        }
    }

    public dispose(): void {
        this.disposables.forEach(disposable => disposable.dispose());
        this.statusBarItem.dispose();
    }
}
