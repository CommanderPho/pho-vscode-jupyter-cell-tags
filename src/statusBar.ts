import * as vscode from 'vscode';
import { notebookRangesToIndices } from './util/notebookSelection';


export class CellSelectionsStatusBarItem {
    private statusBarItem: vscode.StatusBarItem;
    private disposables: vscode.Disposable[] = [];
    private updateTimer: ReturnType<typeof setTimeout> | undefined;
    private static readonly UPDATE_DEBOUNCE_MS = 50;
    private lastText: string | undefined;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.registerEventListeners();
        this.update();
    }

    private registerEventListeners() {
        this.disposables.push(
            vscode.window.onDidChangeActiveNotebookEditor(() => this.update())
        );
        this.disposables.push(
            vscode.window.onDidChangeNotebookEditorSelection(() => this.scheduleUpdate())
        );
    }

    private scheduleUpdate(): void {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }
        this.updateTimer = setTimeout(() => {
            this.updateTimer = undefined;
            this.update();
        }, CellSelectionsStatusBarItem.UPDATE_DEBOUNCE_MS);
    }

    private update() {
        const activeNotebookEditor = vscode.window.activeNotebookEditor;
        if (!activeNotebookEditor) {
            this.lastText = undefined;
            this.statusBarItem.hide();
            return;
        }
        let selectionIndicator = '';
        if (activeNotebookEditor.selections && (activeNotebookEditor.selections.length > 0)) {
            const selectedCellIds = notebookRangesToIndices(activeNotebookEditor.selections).join(', ');
            selectionIndicator = `Selected Cells: ${selectedCellIds} (${activeNotebookEditor.selections.length} cells)`;
        } else {
            selectionIndicator = '<No Notebook Cell Selections>';
        }
        const text = `$(heart) $(preview) ${selectionIndicator}`;
        if (text === this.lastText) {
            return;
        }
        this.lastText = text;
        this.statusBarItem.text = text;
        this.statusBarItem.tooltip = 'Jupyter Cell Tags - Selected Notebook Cells Info';
        this.statusBarItem.show();
    }

    public dispose() {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
            this.updateTimer = undefined;
        }
        this.disposables.forEach(d => d.dispose());
        this.statusBarItem.dispose();
    }
}
