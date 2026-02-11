// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { register as registerCellTags } from './cellTags/cellTags';
import { register as registerAllNotebookTagsView } from './noteAllTags/allNotebookTagsTreeDataProvider';
import { initializeCellHighlight, disposeCellHighlight, highlightCell } from './util/cellVisualHighlight';
import { countSelectedCells } from './util/notebookSelection';
import { activateNotebookRunGroups } from './notebookRunGroups/startup';
import { activateCellHeadings } from './cellHeadings/startup';
// import { registerCommands } from './cellExecution/cellExecutionTracking';
import { activateNotebookCellExecutionTracking } from './cellExecution/startup';
import { detect_conflicting_microsoft_extension } from './helper';
import { activateCustomLogging, log } from './util/logging';
import { registerJumpbackCommand, registerRemoveJumpbackCommand } from './cellJumpbacks/commands';
import { register as registerJumpbackTreeDataProvider } from './cellJumpbacks/JumpbackTreeDataProvider';
import { JumpbackDataSource } from './cellJumpbacks/jumpbackDataSource';
import { CellSelectionsStatusBarItem } from './statusBar';
import { exportTagsForNotebook } from './exportTags/exportTags';
import { importTagsForNotebook } from './importTags/importTags';
import { activateOutlineSync } from './outlineSync/startup';
import { registerCustomOutline } from './customOutline/startup';
import { registerNavigationMenu } from './cellNavigation/navigationMenu';
import { activateCellHistoryTracking } from './cellHistory/startup';
import { registerCellMetadataDisplay } from './cellMetadataDisplay/cellMetadataDisplay';
import { activateRingMeJupyter } from './ringMeJupyter/startup';
import { activateJupyterEnhancementsModule } from './jupyterEnhancements/startup';
// import { register as registerExecutedCellsView } from './cellExecution/ExecutedCellsTreeDataProvider';

export function activate(context: vscode.ExtensionContext) {
    // Activate and Register Commands
    activateCustomLogging(context);

    const has_invalid_extension_installed = detect_conflicting_microsoft_extension();

    // Instantiate and register the new status bar item.
    const selectionStatusBar = new CellSelectionsStatusBarItem();
    context.subscriptions.push(selectionStatusBar);

	registerCellTags(context);
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
    initializeCellHighlight();
    context.subscriptions.push({ dispose: disposeCellHighlight });
    activateNotebookCellExecutionTracking(context);
    activateNotebookRunGroups(context);
    activateCellHeadings(context);
    activateOutlineSync(context);
    registerCustomOutline(context);
    registerNavigationMenu(context);
    activateCellHistoryTracking(context);
    registerCellMetadataDisplay(context);
    activateRingMeJupyter(context);
    activateJupyterEnhancementsModule(context);
    log('Extension activated.');
}

function updateContext() {
    const editor = vscode.window.activeNotebookEditor;
    vscode.commands.executeCommand('setContext', 'jupyter-cell-tags.notebookActive', !!editor);
    if (!editor) {
        vscode.commands.executeCommand('setContext', 'jupyter-cell-tags.singleCellSelected', false);
        vscode.commands.executeCommand('setContext', 'jupyter-cell-tags.multipleCellsSelected', false);
        vscode.commands.executeCommand('setContext', 'jupyter-cell-tags.hasJumpback', false);
        return;
    }
    const selections: readonly vscode.NotebookRange[] = editor.selections;
    const selectedRangesCount = selections.length;
    const total_num_selected_cells = countSelectedCells(selections, editor.notebook);
    vscode.commands.executeCommand('setContext', 'jupyter-cell-tags.singleCellSelected', total_num_selected_cells === 1);
    vscode.commands.executeCommand('setContext', 'jupyter-cell-tags.multipleCellsSelected', total_num_selected_cells > 1);
    
    // Check if the currently selected cell has a jumpback
    let hasJumpback = false;
    if (selections.length > 0 && total_num_selected_cells === 1) {
        const selectedCellIndex = selections[0].start;
        const jumpbackDS = JumpbackDataSource.load(editor.notebook);
        hasJumpback = jumpbackDS.hasJumpback(selectedCellIndex);
    }
    vscode.commands.executeCommand('setContext', 'jupyter-cell-tags.hasJumpback', hasJumpback);
}


export function deactivate() {
    disposeCellHighlight();
}
