// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { register as registerCellTags } from './cellTags/cellTags';
import { register as registerAllNotebookTagsView } from './noteAllTags/allNotebookTagsTreeDataProvider';
import { initializeCellHighlight, disposeCellHighlight, highlightCell } from './util/cellVisualHighlight';
import { countSelectedCells } from './util/notebookSelection';
import { activateNotebookRunGroups } from './notebookRunGroups/startup';
import { activateCellHeadings } from './cellHeadings/startup';
import { registerCommands as registerCellExecutionCommands } from './cellExecution/cellExecutionTracking';
import { activateNotebookCellExecutionTracking } from './cellExecution/startup';
import { detect_conflicting_microsoft_extension } from './helper';
import { activateCustomLogging, log } from './util/logging';
import { registerJumpbackCommand, registerRemoveJumpbackCommand, registerOpenJumpbackCommand } from './cellJumpbacks/commands';
import { register as registerJumpbackTreeDataProvider } from './cellJumpbacks/JumpbackTreeDataProvider';
import { JumpbackDataSource, setJumpbackExtensionContext } from './cellJumpbacks/jumpbackDataSource';
import { CellSelectionsStatusBarItem } from './statusBar';
import { registerFeatureToggleStatusBar } from './featureToggle/featureToggleStatusBar';
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
    migrateDeprecatedFeatureSettings,
} from './util/featureFlags';
import { FeatureActivators, registerFeatureHotToggle } from './util/featureLifecycle';
// import { register as registerExecutedCellsView } from './cellExecution/ExecutedCellsTreeDataProvider';

export async function activate(context: vscode.ExtensionContext) {
    // Activate and Register Commands
    activateCustomLogging(context);

    const has_invalid_extension_installed = detect_conflicting_microsoft_extension();

    // Migrate deprecated enable* settings into features.* before gating activation
    await migrateDeprecatedFeatureSettings();

    // Instantiate and register the new status bar item.
    const selectionStatusBar = new CellSelectionsStatusBarItem();
    context.subscriptions.push(selectionStatusBar);
    registerFeatureToggleStatusBar(context);

	registerCellTags(context);
    registerAllNotebookTagsView(context);

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
    registerCellExecutionCommands(context);
    activateNotebookRunGroups(context);
    activateCellHeadings(context);
    registerNavigationMenu(context);
    registerCellMetadataDisplay(context);

    const optionalFeatures: FeatureActivators = {
        jumpbacks: {
            activate: (ctx) => {
                setJumpbackExtensionContext(ctx);
                registerJumpbackCommand(ctx);
                registerRemoveJumpbackCommand(ctx);
                registerOpenJumpbackCommand(ctx);
                registerJumpbackTreeDataProvider(ctx);
            },
            onDispose: () => setJumpbackExtensionContext(undefined),
        },
        outlineSync: {
            activate: activateOutlineSync,
        },
        customOutline: {
            activate: registerCustomOutline,
        },
        jupyterEnhancements: {
            activate: (ctx) => {
                try {
                    activateJupyterEnhancementsModule(ctx);
                } catch (err) {
                    log(`Jupyter enhancements failed to activate (continuing): ${err}`);
                }
            },
            onDispose: () => {
                try {
                    deactivateJupyterEnhancements();
                } catch {
                    // Feature may not have been activated
                }
            },
        },
        gitDiff: {
            activate: activateGitDiffHighlighting,
        },
        dependencyChain: {
            activate: activateDependencyChain,
        },
        notebookFilter: {
            activate: activateNotebookFilter,
        },
        ringMeJupyter: {
            activate: activateRingMeJupyter,
        },
        durableKernel: {
            activate: (ctx) => {
                try {
                    activateExternalKernel(ctx);
                } catch (err) {
                    log(`Durable external kernel feature failed to activate (continuing): ${err}`);
                }
            },
        },
        cellHistory: {
            activate: activateCellHistoryTracking,
        },
        cellExecutionTracking: {
            activate: activateNotebookCellExecutionTracking,
        },
    };

    await registerFeatureHotToggle(context, optionalFeatures);
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
