// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import * as vscode from 'vscode';
import { updateCellMetadata, getCellMetadata } from '../util/notebookMetadata';

/**
 * Track cell creation and content modification events
 * Sets cellCreated and cellEdited metadata timestamps
 */
export function trackCellHistory(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.workspace.onDidChangeNotebookDocument(e => {
            const timestamp = new Date().toISOString();

            // Handle cell additions (creation)
            e.contentChanges.forEach(change => {
                if (change.addedCells && change.addedCells.length > 0) {
                    change.addedCells.forEach(cell => {
                        // Only set cellCreated if it doesn't already exist (preserve original creation time)
                        const existingCreated = getCellMetadata<string>(cell, ['custom', 'metadata', 'cellCreated'], '');
                        if (!existingCreated) {
                            updateCellMetadata(cell, ['custom', 'metadata', 'cellCreated'], timestamp).catch(err => {
                                console.error(`Failed to update cellCreated metadata for cell ${cell.index}:`, err);
                            });
                        }
                    });
                }
            });

            // Handle cell content modifications (edits)
            e.cellChanges.forEach(change => {
                // Check if the document (cell content) was modified
                if (change.document) {
                    const cell = change.cell;
                    // Always update cellEdited when content changes (overwrite with latest edit time)
                    updateCellMetadata(cell, ['custom', 'metadata', 'cellEdited'], timestamp).catch(err => {
                        console.error(`Failed to update cellEdited metadata for cell ${cell.index}:`, err);
                    });
                }
            });
        })
    );
}
