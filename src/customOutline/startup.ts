import * as vscode from 'vscode';
import { HeadingParser } from './HeadingParser';
import { NotebookOutlineTreeDataProvider } from './NotebookOutlineTreeDataProvider';
import { OutlineItem } from './models';
import { UpdateCoordinator } from './UpdateCoordinator';
import { OutlineSelectionSync } from './OutlineSelectionSync';
import { getSelectionDetector, getSyncManager } from '../outlineSync/startup';
import { log } from '../util/logging';

/**
 * Register the custom notebook outline view, commands, and synchronization.
 */
export function registerCustomOutline(context: vscode.ExtensionContext): void {
    const customOutlineConfig = vscode.workspace.getConfiguration('jupyter-cell-tags.customOutline');
    const enabled = customOutlineConfig.get<boolean>('enabled', true);
    const debounceMs = customOutlineConfig.get<number>('updateDebounceMs', 200);

    if (!enabled) {
        log('Custom notebook outline is disabled via configuration. Skipping registration.');
        return;
    }

    log('Registering custom notebook outline view...');

    const headingParser = new HeadingParser();
    const provider = new NotebookOutlineTreeDataProvider(headingParser);

    const treeView = vscode.window.createTreeView<OutlineItem>('custom-notebook-outline', {
        treeDataProvider: provider,
        canSelectMany: true
    });
    context.subscriptions.push(treeView);

    const selectionDetector = getSelectionDetector();
    const outlineSyncManager = getSyncManager();

    const updateCoordinator = new UpdateCoordinator(treeView, provider, debounceMs);

    // Initial population based on the active notebook
    updateCoordinator.scheduleUpdate();

    // Listen to notebook editor and document changes
    context.subscriptions.push(
        vscode.window.onDidChangeActiveNotebookEditor(() => {
            updateCoordinator.scheduleUpdate();
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeNotebookDocument(() => {
            updateCoordinator.scheduleUpdate();
        })
    );

    // Configuration change handling for customOutline.*
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('jupyter-cell-tags.customOutline')) {
                const cfg = vscode.workspace.getConfiguration('jupyter-cell-tags.customOutline');
                const newEnabled = cfg.get<boolean>('enabled', true);
                const newDebounce = cfg.get<number>('updateDebounceMs', debounceMs);

                if (!newEnabled) {
                    updateCoordinator.cancelPendingUpdates();
                } else {
                    updateCoordinator.setDebounceDelay(newDebounce);
                    updateCoordinator.scheduleUpdate();
                }

                // showCellIndices is respected by OutlineItem via configuration;
                // a refresh will recreate tree items with new labels.
                provider.refresh();
            }
        })
    );

    const selectionSync = new OutlineSelectionSync(treeView, selectionDetector);

    // Sync outline -> editor when tree view selection changes
    context.subscriptions.push(
        treeView.onDidChangeSelection(async event => {
            await selectionSync.syncOutlineToEditor(event.selection);
            if (outlineSyncManager && vscode.window.activeNotebookEditor) {
                // Keep built-in Outline pane synchronized as well
                await outlineSyncManager.syncOutline(vscode.window.activeNotebookEditor);
            }
        })
    );

    // Sync editor -> outline by reusing shared SelectionChangeDetector
    if (selectionDetector) {
        const disposable = selectionDetector.onSelectionChange(async (editor, _selections) => {
            const items = provider.getOutlineItems();
            await selectionSync.syncEditorToOutline(editor, items);
        });
        context.subscriptions.push(disposable);
    }

    // Track which outline items are currently within the visible notebook range
    context.subscriptions.push(
        vscode.window.onDidChangeNotebookEditorVisibleRanges(async event => {
            const editor = event.notebookEditor;
            if (!editor || editor !== vscode.window.activeNotebookEditor) {
                return;
            }

            const outlineItems = provider.getOutlineItems();
            if (!outlineItems.length) {
                provider.updateVisibleItems(new Set());
                return;
            }

            const visibleRanges = editor.visibleRanges ?? [];
            if (!visibleRanges.length) {
                provider.updateVisibleItems(new Set());
                return;
            }

            // Mark headings whose *heading cell* is currently within any visible
            // notebook range. This tends to match user expectation better than
            // using the full child range, and avoids gaps between items.
            const visibleItems = new Set<OutlineItem>();
            for (const item of outlineItems) {
                const cellIndex = item.cellIndex;
                const isHeadingCellVisible = visibleRanges.some(v =>
                    v.start <= cellIndex && cellIndex < v.end
                );
                if (isHeadingCellVisible) {
                    visibleItems.add(item);
                }
            }

            provider.updateVisibleItems(visibleItems);
        })
    );

    // Command: click on outline item selects its heading cell
    context.subscriptions.push(
        vscode.commands.registerCommand('jupyter-cell-tags.customOutline.selectCell', async (item: OutlineItem) => {
            if (!item) {
                return;
            }
            await selectionSync.syncOutlineToEditor([item]);
            const editor = vscode.window.activeNotebookEditor;
            if (editor) {
                const range = new vscode.NotebookRange(item.cellIndex, item.cellIndex + 1);
                editor.revealRange(range, vscode.NotebookEditorRevealType.AtTop);
            }
        })
    );

    // Command: select all child cells under a heading
    context.subscriptions.push(
        vscode.commands.registerCommand('jupyter-cell-tags.customOutline.selectAllChildCells', async (item: OutlineItem) => {
            const editor = vscode.window.activeNotebookEditor;
            if (!editor || !item) {
                return;
            }

            const range = item.childCellRange;
            const ranges = [range];

            try {
                if (selectionDetector) {
                    selectionDetector.triggerSelectionChange(editor, ranges);
                } else {
                    editor.selections = ranges;
                }

                if (outlineSyncManager) {
                    await outlineSyncManager.syncOutline(editor);
                }
            } catch (error) {
                log(`Failed to execute Select All Child Cells for custom outline: ${error}`);
            }
        })
    );

    log('Custom notebook outline view registered successfully.');
}
