// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { register as registerCellTags } from './cellTags/cellTags';
import { register as registerCellTagsView } from './cellTags/cellTagsTreeDataProvider';
import { register as registerAllNotebookTagsView } from './noteAllTags/allNotebookTagsTreeDataProvider';
import { countSelectedCells } from './util/notebookSelection';
import { activateNotebookRunGroups } from './notebookRunGroups/startup';
import { activateCellHeadings } from './cellHeadings/startup';
import { registerCommands } from './cellExecution/cellExecutionTracking';
import { activateCustomLogging, log } from './util/logging';
import { registerJumpbackCommand, registerRemoveJumpbackCommand } from './cellJumpbacks/commands';
import { register as registerJumpbackTreeDataProvider } from './cellJumpbacks/JumpbackTreeDataProvider';
import { CellSelectionsStatusBarItem } from './statusBar';
import { exportTagsForNotebook } from './exportTags/exportTags';
import { importTagsForNotebook } from './importTags/importTags';

export function activate(context: vscode.ExtensionContext) {
    // Activate and Register Commands
    activateCustomLogging(context);

    // Instantiate and register the new status bar item.
    const selectionStatusBar = new CellSelectionsStatusBarItem();
    context.subscriptions.push(selectionStatusBar);

	registerCellTags(context);
	registerCellTagsView(context);
    registerAllNotebookTagsView(context);
    registerJumpbackCommand(context);
    registerRemoveJumpbackCommand(context);
    registerJumpbackTreeDataProvider(context);

    context.subscriptions.push(
        vscode.commands.registerCommand('jupyter-cell-tags.exportTags', exportTagsForNotebook),
        vscode.commands.registerCommand('jupyter-cell-tags.importTags', importTagsForNotebook)
    );
	// Update context when the active editor or selection changes
	vscode.window.onDidChangeActiveNotebookEditor(updateContext);
	vscode.window.onDidChangeNotebookEditorSelection(updateContext);

	updateContext();
    activateNotebookRunGroups(context);
    activateCellHeadings(context);
    log('Extension activated.');
}

function updateContext() {
    const editor = vscode.window.activeNotebookEditor;
    if (!editor) {
        vscode.commands.executeCommand('setContext', 'jupyter-cell-tags.singleCellSelected', false);
        vscode.commands.executeCommand('setContext', 'jupyter-cell-tags.multipleCellsSelected', false);
        vscode.commands.executeCommand('setContext', 'jupyter-cell-tags.hasJumpback', false);
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
    vscode.commands.executeCommand('setContext', 'jupyter-cell-tags.hasJumpback', false); // todo - IMPLEMENT THIS LOGIC
}


export function deactivate() {}
