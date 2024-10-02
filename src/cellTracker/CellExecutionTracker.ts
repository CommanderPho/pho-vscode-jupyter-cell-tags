// src/cellTracker/CellExecutionTracker.ts

import * as vscode from 'vscode';

// interface TrackedCells {
//     lastFailedCell: vscode.NotebookCell | null;
//     lastSuccessfulCell: vscode.NotebookCell | null;
// }

interface TrackedCells {
    failedCells: vscode.NotebookCell[];
    successfulCells: vscode.NotebookCell[];
}


export class CellExecutionTracker {
    private trackedCellsMap: Map<vscode.NotebookDocument, TrackedCells> = new Map();
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    public initialize() {
        // Load state
        // const savedState = this.context.globalState.get<Map<string, TrackedCells>>('trackedCells', new Map());
        const savedState = this.context.globalState.get<Map<string, TrackedCells>>('trackedCells', new Map());
        this.trackedCellsMap = new Map(savedState);

        // Listen to cell execution events
        this.context.subscriptions.push(
            vscode.notebook.onDidChangeNotebookCellExecution(e => this.handleCellExecution(e))
        );

        // Listen to notebook closure to clean up tracked cells
        this.context.subscriptions.push(
            vscode.workspace.onDidCloseNotebookDocument(doc => this.handleNotebookClosure(doc))
        );

        // Listen to events to save state
        this.context.subscriptions.push(
            vscode.workspace.onDidChangeNotebookDocument(e => this.saveState())
        );
    }

    private saveState() {
        this.context.globalState.update('trackedCells', this.trackedCellsMap);
    }

    private handleCellExecution(e: vscode.NotebookCellExecutionStateChangeEvent) {
        const cell = e.cell;
        const notebook = cell.notebook;

        if (!this.trackedCellsMap.has(notebook)) {
            this.trackedCellsMap.set(notebook, { lastFailedCell: null, lastSuccessfulCell: null });
        }

        const tracked = this.trackedCellsMap.get(notebook)!;

        if (e.state.kind === vscode.NotebookCellExecutionStateKind.Error) {
            tracked.lastFailedCell = cell;
            vscode.window.showWarningMessage(`Cell "${this.getCellLabel(cell)}" failed.`);
        } else if (e.state.kind === vscode.NotebookCellExecutionStateKind.Success) {
            tracked.lastSuccessfulCell = cell;
            vscode.window.showInformationMessage(`Cell "${this.getCellLabel(cell)}" executed successfully.`);
        }

        // Update the map
        this.trackedCellsMap.set(notebook, tracked);
    }

    private handleNotebookClosure(doc: vscode.NotebookDocument) {
        if (this.trackedCellsMap.has(doc)) {
            this.trackedCellsMap.delete(doc);
        }
    }

    public getLastFailedCell(notebook: vscode.NotebookDocument): vscode.NotebookCell | null {
        const tracked = this.trackedCellsMap.get(notebook);
        return tracked ? tracked.lastFailedCell : null;
    }

    public getLastSuccessfulCell(notebook: vscode.NotebookDocument): vscode.NotebookCell | null {
        const tracked = this.trackedCellsMap.get(notebook);
        return tracked ? tracked.lastSuccessfulCell : null;
    }

    private getCellLabel(cell: vscode.NotebookCell): string {
        // Customize based on your CellReference structure or metadata
        const index = cell.index;
        return `Cell ${index + 1}`;
    }
}
