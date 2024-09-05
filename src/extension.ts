// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
// const myOutputChannel = vscode.window.createOutputChannel("Pho Hale Extension - Jupyter Cell Tags");
// myOutputChannel.appendLine("This is a log message from my extension");
// myOutputChannel.show(true);

import { myOutputChannel as myOutputChannel } from './helper';

import { register as registerCellTags } from './cellTags';
import { register as registerCellTagsView } from './cellTagsTreeDataProvider';

let debugSelectedCellsStatusBarItem: vscode.StatusBarItem;


export function activate(context: vscode.ExtensionContext) {
    console.log('Extension "Pho Hale Extension - Jupyter Cell Tags" is now active!');
    myOutputChannel.appendLine("activate");

	registerCellTags(context);
	registerCellTagsView(context);

    // Create a new status bar item
    debugSelectedCellsStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    context.subscriptions.push(debugSelectedCellsStatusBarItem);

    // Update context when the active editor or selection changes
    vscode.window.onDidChangeActiveNotebookEditor(updateContext);
    vscode.window.onDidChangeNotebookEditorSelection(updateContext);
    vscode.window.onDidChangeVisibleNotebookEditors(updateContext);

    // Initialize the status bar
    updateContext();

    myOutputChannel.appendLine("/activate");
    myOutputChannel.show(true);
}

function updateContext() {
    myOutputChannel.appendLine("updateContext");
    const editor = vscode.window.activeNotebookEditor;
    if (!editor) {
        vscode.commands.executeCommand('setContext', 'jupyter-cell-tags.singleCellSelected', false);
        vscode.commands.executeCommand('setContext', 'jupyter-cell-tags.multipleCellsSelected', false);
        myOutputChannel.appendLine('No active notebook editor');
        debugSelectedCellsStatusBarItem.hide();
        return;
    }

    const selections: readonly vscode.NotebookRange[] = editor.selections; // NotebookRange[]
    const selectedRangesCount = selections.length;
    myOutputChannel.appendLine(`Selection num ranges count: ${selectedRangesCount}`);
	// Selected cells: Start(0), End(2)
	// Selected cells: Start(3), End(4)
    // Selection count: 2
    var total_num_selected_cells = 0;
    selections.forEach(selection => {
        const range = selection as vscode.NotebookRange;
        if (!range.isEmpty) {
            const num_selected_cells = range.end - range.start
            total_num_selected_cells += num_selected_cells;
        }
        myOutputChannel.appendLine(`\tSelected cells: Start(${range.start}), End(${range.end})`);
    });
    // TODO 2024-09-05 17:47: - [ ] Got num selected cells nearly working, it will always be correct to tell if 1 vs. many cells.
    // Noticed error below, there were only 3 cells in the notebook but it returned 4 cells. I think the last index should be excluded but then it would give zero for single cell selections?
    // Selection num ranges count: 1
    // 	Selected cells: Start(0), End(4)
    // Selection count: 4

    const selectionCount = total_num_selected_cells;

    myOutputChannel.appendLine(`Selection count: ${selectionCount}`);
    myOutputChannel.appendLine(`Single cell selected: ${selectionCount === 1}`);
    myOutputChannel.appendLine(`Multiple cells selected: ${selectionCount > 1}`);

    vscode.commands.executeCommand('setContext', 'jupyter-cell-tags.singleCellSelected', selectionCount === 1);
    vscode.commands.executeCommand('setContext', 'jupyter-cell-tags.multipleCellsSelected', selectionCount > 1);

    debugSelectedCellsStatusBarItem.text = `$(notebook) ${selectionCount} Cell(s) Selected`;
    debugSelectedCellsStatusBarItem.show();
}



export function deactivate() {
    myOutputChannel.appendLine("deactivate");
    if (debugSelectedCellsStatusBarItem) {
        debugSelectedCellsStatusBarItem.dispose();
    }
}
