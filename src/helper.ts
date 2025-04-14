// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { sortObjectPropertiesRecursively, useCustomMetadata } from './util/notebookMetadata';

// export const myOutputChannel = vscode.window.createOutputChannel("Pho Hale Extension - Jupyter Cell Tags");
// myOutputChannel.appendLine("This is a log message from my extension");
// myOutputChannel.show(true);


export function getCellTags(cell: vscode.NotebookCell): string[] {
    const currentTags = (useCustomMetadata() ? cell.metadata.custom?.metadata?.tags : cell.metadata.metadata?.tags) ?? [];
    return [...currentTags];
}

export async function updateCellTags(cell: vscode.NotebookCell, tags: string[], defer_apply: boolean = false) {
    const metadata = JSON.parse(JSON.stringify(cell.metadata));
    if (useCustomMetadata()) {
        metadata.custom = metadata.custom || {};
        metadata.custom.metadata = metadata.custom.metadata || {};
        metadata.custom.metadata.tags = tags;
        if (tags.length === 0) {
            delete metadata.custom.metadata.tags;
        }
    } else {
        metadata.metadata = metadata.metadata || {};
        metadata.metadata.tags = tags;
        if (tags.length === 0) {
            delete metadata.metadata.tags;
        }
    }
    if (!defer_apply) {
        const edit = new vscode.WorkspaceEdit();
        const nbEdit = vscode.NotebookEdit.updateCellMetadata(cell.index, sortObjectPropertiesRecursively(metadata));
        edit.set(cell.notebook.uri, [nbEdit]);
        await vscode.workspace.applyEdit(edit);
    } else {
        const nbEdit = vscode.NotebookEdit.updateCellMetadata(cell.index, sortObjectPropertiesRecursively(metadata));
        return nbEdit;
    }
}

// Function to update cell metadata and save it to the file
export async function updateAndSaveCellMetadata(cell: vscode.NotebookCell, tags: string[]) {
    // Step 1: Modify the metadata
    const metadata = { ...cell.metadata };

    // Assuming custom metadata structure (ensure compatibility with Jupyter Notebook)
    if (!metadata.custom) {
        metadata.custom = {};
    }
    if (!metadata.custom.metadata) {
        metadata.custom.metadata = {};
    }

    // Add tags to metadata
    metadata.custom.metadata.tags = tags;

    // Step 2: Create a workspace edit to apply the changes
    const edit = new vscode.WorkspaceEdit();
    const notebookEdit = vscode.NotebookEdit.updateCellMetadata(cell.index, metadata);
    edit.set(cell.notebook.uri, [notebookEdit]);

    // Apply the edit
    const success = await vscode.workspace.applyEdit(edit);

    // Step 3: Save the notebook file to persist the changes
    if (success) {
        await vscode.workspace.saveAll(false); // This saves all unsaved documents, including notebooks
    } else {
        vscode.window.showErrorMessage("Failed to update cell metadata.");
    }
}

