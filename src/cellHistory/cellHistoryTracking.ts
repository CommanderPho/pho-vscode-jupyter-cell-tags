// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import * as vscode from 'vscode';
import { updateCellMetadata, getCellMetadata } from '../util/notebookMetadata';

const EDIT_DEBOUNCE_MS = 1500;

/**
 * Track cell creation and content modification events
 * Sets cellCreated and cellEdited metadata timestamps (debounced for edits).
 */
export function trackCellHistory(context: vscode.ExtensionContext) {
    const pendingEdits = new Map<string, { cell: vscode.NotebookCell; timer: ReturnType<typeof setTimeout> }>();

    const flushEdit = (key: string) => {
        const pending = pendingEdits.get(key);
        if (!pending) {
            return;
        }
        pendingEdits.delete(key);
        const timestamp = new Date().toISOString();
        updateCellMetadata(pending.cell, ['custom', 'metadata', 'cellEdited'], timestamp).catch(err => {
            console.error(`Failed to update cellEdited metadata for cell ${pending.cell.index}:`, err);
        });
    };

    context.subscriptions.push(
        vscode.workspace.onDidChangeNotebookDocument(e => {
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
                if (!change.document) {
                    return;
                }
                const cell = change.cell;
                const key = cell.document.uri.toString();
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
                for (const pending of pendingEdits.values()) {
                    clearTimeout(pending.timer);
                }
                pendingEdits.clear();
            }
        }
    );
}
