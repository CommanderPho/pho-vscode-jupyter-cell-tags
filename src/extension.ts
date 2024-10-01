// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { register as registerCellTags } from './cellTags';
import { register as registerCellTagsView } from './cellTagsTreeDataProvider';
import { register as registerAllNotebookTagsView } from './allNotebookTagsTreeDataProvider';
import { countSelectedCells } from './helper';
import { activateNotebookRunGroups } from './notebookRunGroups/startup';
import { CellExecutionTracker } from './cellTracker';


export function activate(context: vscode.ExtensionContext) {
	registerCellTags(context);
	registerCellTagsView(context);
    registerAllNotebookTagsView(context);

    // Initialize the Cell Execution Tracker
    const cellExecutionTracker = new CellExecutionTracker(context);
    cellExecutionTracker.initialize();

    // Register existing commands
    context.subscriptions.push(
        vscode.commands.registerCommand('jupyter-cell-tags.navigateToLastFailedCell', () => navigateToLastFailedCell(cellExecutionTracker)),
        vscode.commands.registerCommand('jupyter-cell-tags.navigateToLastSuccessfulCell', () => navigateToLastSuccessfulCell(cellExecutionTracker))
    );

    // Create status bar items
    const statusBarFailed = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarFailed.command = 'jupyter-cell-tags.navigateToLastFailedCell';
    statusBarFailed.text = '$(alert) Last Failed Cell';
    statusBarFailed.tooltip = 'Navigate to the most recently failed Jupyter cell';
    statusBarFailed.show();
    context.subscriptions.push(statusBarFailed);

    const statusBarSuccess = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    statusBarSuccess.command = 'jupyter-cell-tags.navigateToLastSuccessfulCell';
    statusBarSuccess.text = '$(check) Last Successful Cell';
    statusBarSuccess.tooltip = 'Navigate to the most recently successfully executed Jupyter cell';
    statusBarSuccess.show();
    context.subscriptions.push(statusBarSuccess);

    // Initialize tracking
    // const trackedCellsMap: Map<vscode.NotebookDocument, TrackedCells> = new Map();

    // // Listen to cell execution events
    // context.subscriptions.push(
    //     vscode.notebook.onDidChangeNotebookCellExecution(e => {
    //         handleCellExecution(e, trackedCellsMap, context);
    //     })
    // );

    // // Listen to notebook closure to clean up tracking
    // context.subscriptions.push(
    //     vscode.workspace.onDidCloseNotebookDocument(doc => {
    //         if (trackedCellsMap.has(doc)) {
    //             trackedCellsMap.delete(doc);
    //         }
    //     })
    // );

	// Update context when the active editor or selection changes
	vscode.window.onDidChangeActiveNotebookEditor(updateContext);
	vscode.window.onDidChangeNotebookEditorSelection(updateContext);

	updateContext();
    activateNotebookRunGroups(context);



}

function updateContext() {
    const editor = vscode.window.activeNotebookEditor;
    if (!editor) {
        vscode.commands.executeCommand('setContext', 'jupyter-cell-tags.singleCellSelected', false);
        vscode.commands.executeCommand('setContext', 'jupyter-cell-tags.multipleCellsSelected', false);
        return;
    }
    // TODO 2024-09-05 17:47: - [ ] Got num selected cells nearly working, it will always be correct to tell if 1 vs. many cells.
    // Noticed error below, there were only 3 cells in the notebook but it returned 4 cells. I think the last index should be excluded but then it would give zero for single cell selections?
    // Selection num ranges count: 1
    // 	Selected cells: Start(0), End(4)
    // Selection count: 4
    const selections: readonly vscode.NotebookRange[] = editor.selections;
    const selectedRangesCount = selections.length;
    const total_num_selected_cells = countSelectedCells(selections);
    vscode.commands.executeCommand('setContext', 'jupyter-cell-tags.singleCellSelected', total_num_selected_cells === 1);
    vscode.commands.executeCommand('setContext', 'jupyter-cell-tags.multipleCellsSelected', total_num_selected_cells > 1);
}


export function deactivate() {}



// Command Implementations

async function openNotebookCell(cellIndex: number) {
    const editor = vscode.window.activeNotebookEditor;
    if (editor) {
        const range = new vscode.NotebookRange(cellIndex, cellIndex + 1);
        editor.revealRange(range, vscode.NotebookEditorRevealType.Default);
        editor.selections = [range]; // Highlight the cell
    } else {
        vscode.window.showErrorMessage('No active notebook editor found.');
    }
}

// async function runTag(tag: string) {
//     // Implement your run logic here
//     vscode.window.showInformationMessage(`Running all cells with tag: ${tag}`);
// }

async function navigateToLastFailedCell(cellExecutionTracker: CellExecutionTracker) {
    const editor = vscode.window.activeNotebookEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active notebook editor found.');
        return;
    }

    const notebook = editor.notebook;
    const lastFailedCell = cellExecutionTracker.getLastFailedCell(notebook);

    if (!lastFailedCell) {
        vscode.window.showInformationMessage('No failed cell executions found.');
        return;
    }

    const cellIndex = notebook.getCells().indexOf(lastFailedCell);
    if (cellIndex === -1) {
        vscode.window.showErrorMessage('Failed cell not found in the notebook.');
        return;
    }

    const range = new vscode.NotebookRange(cellIndex, cellIndex + 1);
    editor.revealRange(range, vscode.NotebookEditorRevealType.Default);
    editor.selections = [range]; // Highlight the cell
}

async function navigateToLastSuccessfulCell(cellExecutionTracker: CellExecutionTracker) {
    const editor = vscode.window.activeNotebookEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active notebook editor found.');
        return;
    }

    const notebook = editor.notebook;
    const lastSuccessfulCell = cellExecutionTracker.getLastSuccessfulCell(notebook);

    if (!lastSuccessfulCell) {
        vscode.window.showInformationMessage('No successful cell executions found.');
        return;
    }

    const cellIndex = notebook.getCells().indexOf(lastSuccessfulCell);
    if (cellIndex === -1) {
        vscode.window.showErrorMessage('Successful cell not found in the notebook.');
        return;
    }

    const range = new vscode.NotebookRange(cellIndex, cellIndex + 1);
    editor.revealRange(range, vscode.NotebookEditorRevealType.Default);
    editor.selections = [range]; // Highlight the cell
}
