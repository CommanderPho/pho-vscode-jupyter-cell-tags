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
import { registerJumpbackCommand, registerRemoveJumpbackCommand, registerOpenJumpbackCommand } from './cellJumpbacks/commands';
import { register as registerJumpbackTreeDataProvider } from './cellJumpbacks/JumpbackTreeDataProvider';
import { JumpbackDataSource, setJumpbackExtensionContext } from './cellJumpbacks/jumpbackDataSource';
import { CellSelectionsStatusBarItem } from './statusBar';
import { exportTagsForNotebook } from './exportTags/exportTags';
import { importTagsForNotebook } from './importTags/importTags';
import { exportExecutedCodeToPython } from './exportExecutedCode/exportExecutedCode';
import { activateOutlineSync } from './outlineSync/startup';
import { registerCustomOutline } from './customOutline/startup';
import { registerNavigationMenu } from './cellNavigation/navigationMenu';
import { activateCellHistoryTracking } from './cellHistory/startup';
import { registerCellMetadataDisplay } from './cellMetadataDisplay/cellMetadataDisplay';
import { activateRingMeJupyter } from './ringMeJupyter/startup';
import { activateJupyterEnhancementsModule } from './jupyterEnhancements/startup';
import { deactivateJupyterEnhancements } from './jupyterEnhancements/extension';
import { activateGitDiffHighlighting } from './gitDiff/startup';
import { activateDependencyChain } from './dependencyChain/startup';
import { activateNotebookFilter } from './notebookFilter/startup';
import { activateExternalKernel } from './externalKernel/startup';
import {
    isFeatureEnabled,
    migrateDeprecatedFeatureSettings,
    registerFeatureReloadPrompt,
} from './util/featureFlags';
// import { register as registerExecutedCellsView } from './cellExecution/ExecutedCellsTreeDataProvider';

export async function activate(context: vscode.ExtensionContext) {
    // Activate and Register Commands
    activateCustomLogging(context);

    const has_invalid_extension_installed = detect_conflicting_microsoft_extension();

    // Migrate deprecated enable* settings into features.* before gating activation
    await migrateDeprecatedFeatureSettings();
    registerFeatureReloadPrompt(context);

    // Instantiate and register the new status bar item.
    const selectionStatusBar = new CellSelectionsStatusBarItem();
    context.subscriptions.push(selectionStatusBar);

	registerCellTags(context);
    registerAllNotebookTagsView(context);

    if (isFeatureEnabled('jumpbacks')) {
        setJumpbackExtensionContext(context);
        registerJumpbackCommand(context);
        registerRemoveJumpbackCommand(context);
        registerOpenJumpbackCommand(context);
        registerJumpbackTreeDataProvider(context);
    }

    context.subscriptions.push(
        vscode.commands.registerCommand('jupyter-cell-tags.exportTags', exportTagsForNotebook),
        vscode.commands.registerCommand('jupyter-cell-tags.importTags', importTagsForNotebook),
        vscode.commands.registerCommand('jupyter-cell-tags.exportExecutedCodeToPython', exportExecutedCodeToPython)
    );
	// Update context when the active editor or selection changes
	context.subscriptions.push(
		vscode.window.onDidChangeActiveNotebookEditor(() => updateContext()),
		vscode.window.onDidChangeNotebookEditorSelection(() => updateContext()),
		vscode.window.onDidChangeActiveTextEditor(() => updateContext()),
		vscode.window.onDidChangeTextEditorSelection(() => _scheduleUpdateContext()),
	);

	updateContext();
    initializeCellHighlight();
    context.subscriptions.push({ dispose: disposeCellHighlight });
    if (isFeatureEnabled('cellExecutionTracking')) {
        activateNotebookCellExecutionTracking(context);
    }
    activateNotebookRunGroups(context);
    activateCellHeadings(context);
    if (isFeatureEnabled('outlineSync')) {
        activateOutlineSync(context);
    }
    if (isFeatureEnabled('customOutline')) {
        registerCustomOutline(context);
    }
    registerNavigationMenu(context);
    if (isFeatureEnabled('cellHistory')) {
        activateCellHistoryTracking(context);
    }
    registerCellMetadataDisplay(context);
    if (isFeatureEnabled('ringMeJupyter')) {
        activateRingMeJupyter(context);
    }
    if (isFeatureEnabled('notebookFilter')) {
        activateNotebookFilter(context);
    }
    if (isFeatureEnabled('jupyterEnhancements')) {
        try {
            activateJupyterEnhancementsModule(context);
        } catch (err) {
            log(`Jupyter enhancements failed to activate (continuing): ${err}`);
        }
    }
    if (isFeatureEnabled('gitDiff')) {
        activateGitDiffHighlighting(context);
    }
    if (isFeatureEnabled('dependencyChain')) {
        activateDependencyChain(context);
    }
    if (isFeatureEnabled('durableKernel')) {
        try {
            activateExternalKernel(context);
        } catch (err) {
            log(`Durable external kernel feature failed to activate (continuing): ${err}`);
        }
    }
    log('Extension activated.');
}

let _updateContextTimer: ReturnType<typeof setTimeout> | undefined;
const _contextCache: {
    notebookActive?: boolean;
    jumpbackTargetActive?: boolean;
    singleCellSelected?: boolean;
    multipleCellsSelected?: boolean;
    hasJumpback?: boolean;
} = {};

function _setContextIfChanged(key: string, value: boolean): void {
    if ((_contextCache as Record<string, boolean | undefined>)[key] !== value) {
        (_contextCache as Record<string, boolean | undefined>)[key] = value;
        vscode.commands.executeCommand('setContext', key, value);
    }
}

function _scheduleUpdateContext(): void {
    if (_updateContextTimer) {
        clearTimeout(_updateContextTimer);
    }
    _updateContextTimer = setTimeout(() => {
        _updateContextTimer = undefined;
        updateContext();
    }, 100);
}

function updateContext() {
    const editor = vscode.window.activeNotebookEditor;
    _setContextIfChanged('jupyter-cell-tags.notebookActive', !!editor);

    const textEditor = vscode.window.activeTextEditor;
    const isPlainTextEditor = !!textEditor && textEditor.document.uri.scheme !== 'vscode-notebook-cell';
    _setContextIfChanged('jupyter-cell-tags.jumpbackTargetActive', !!editor || isPlainTextEditor);

    if (!editor) {
        _setContextIfChanged('jupyter-cell-tags.singleCellSelected', false);
        _setContextIfChanged('jupyter-cell-tags.multipleCellsSelected', false);

        let hasJumpback = false;
        if (isPlainTextEditor && textEditor) {
            const ds = JumpbackDataSource.loadFromTextDocument(textEditor.document);
            hasJumpback = ds.hasTextJumpbackOnLine(textEditor.selection.active.line);
        }
        _setContextIfChanged('jupyter-cell-tags.hasJumpback', hasJumpback);
        return;
    }
    const selections: readonly vscode.NotebookRange[] = editor.selections;
    const selectedRangesCount = selections.length;
    const total_num_selected_cells = countSelectedCells(selections, editor.notebook);
    _setContextIfChanged('jupyter-cell-tags.singleCellSelected', total_num_selected_cells === 1);
    _setContextIfChanged('jupyter-cell-tags.multipleCellsSelected', total_num_selected_cells > 1);

    // Check if the currently selected cell has a jumpback
    let hasJumpback = false;
    if (selections.length > 0 && total_num_selected_cells === 1) {
        const selectedCellIndex = selections[0].start;
        const jumpbackDS = JumpbackDataSource.loadFromNotebook(editor.notebook);
        hasJumpback = jumpbackDS.hasNotebookJumpback(selectedCellIndex);
    }
    _setContextIfChanged('jupyter-cell-tags.hasJumpback', hasJumpback);
}


export function deactivate() {
    disposeCellHighlight();
    try {
        deactivateJupyterEnhancements();
    } catch {
        // Feature may not have been activated
    }
}
