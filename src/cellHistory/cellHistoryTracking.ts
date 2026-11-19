// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import * as vscode from 'vscode';
import { updateCellMetadata, getCellMetadata } from '../util/notebookMetadata';

const EDIT_DEBOUNCE_MS = 1500;

/**
 * Track cell creation and content modification events.
 * Sets cellCreated and cellEdited metadata timestamps (debounced for edits).
 *
 * Important: this intentionally writes notebook cell metadata (and will dirty
 * the document) only when cell content actually changes or a cell is added.
 * Opening a notebook or navigating between cells must not trigger writes.
 * Pending timers are cleared on dispose without flushing, so extension reload
 * / deactivate cannot mark a clean notebook dirty.
 */
export function trackCellHistory(context: vscode.ExtensionContext) {
    const pendingEdits = new Map<string, { cell: vscode.NotebookCell; timer: ReturnType<typeof setTimeout> }>();

    const flushEdit = (key: string) => {
        const pending = pendingEdits.get(key);
        if (!pending) {
            return;
        }
        pendingEdits.delete(key);
        const { cell } = pending;
        if (cell.notebook.isClosed) {
            return;
        }
        const timestamp = new Date().toISOString();
        updateCellMetadata(cell, ['custom', 'metadata', 'cellEdited'], timestamp).catch(err => {
            console.error(`Failed to update cellEdited metadata for cell ${cell.index}:`, err);
        });
    };

    context.subscriptions.push(
        vscode.workspace.onDidChangeNotebookDocument(e => {
            // Metadata-only / output / executionSummary changes are not content edits.
            // Navigating or opening must not dirty the notebook via this tracker.
            const timestamp = new Date().toISOString();

            e.contentChanges.forEach(change => {
                if (change.addedCells && change.addedCells.length > 0) {
                    change.addedCells.forEach(cell => {
                        const existingCreated = getCellMetadata<string>(cell, ['custom', 'metadata', 'cellCreated'], '');
                        if (!existingCreated) {
                            updateCellMetadata(cell, ['custom', 'metadata', 'cellCreated'], timestamp).catch(err => {
                                console.error(`Failed to update cellCreated metadata for cell ${cell.index}:`, err);
                            });
                        }
                    });
                }
            });

            e.cellChanges.forEach(change => {
                // Only cell document text changes — not metadata, outputs, or executionSummary
                if (!change.document) {
                    return;
                }
                const cell = change.cell;
                const key = `${cell.notebook.uri.toString()}#${cell.document.uri.toString()}`;
                const existing = pendingEdits.get(key);
                if (existing) {
                    clearTimeout(existing.timer);
                }
                const timer = setTimeout(() => flushEdit(key), EDIT_DEBOUNCE_MS);
                pendingEdits.set(key, { cell, timer });
            });
        }),
        {
            dispose: () => {
                // Drop pending timestamps without applying — flushing here would
                // dirty open notebooks on extension deactivate / reload.
                for (const [, pending] of pendingEdits) {
                    clearTimeout(pending.timer);
                }
                pendingEdits.clear();
            }
        }
    );
}
