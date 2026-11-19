// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import * as vscode from 'vscode';
import { log } from '../../util/logging';
import { metadataDeepEqual } from '../../util/notebookMetadata';


// Retrieve the cell run group value
export function getCellRunGroupMetadata(cell: vscode.NotebookCell): string {
    const customMetadata = cell.metadata?.custom?.metadata?.notebookRunGroups;

    if (customMetadata && customMetadata.groupValue) {
        return customMetadata.groupValue;
    }

    // Empty string if we don't have custom metadata or the block is missing
    return '';
}

// Update cell metadata with the new run group value
export async function updateCellRunGroupMetadata(cell: vscode.NotebookCell, newGroupValue: string): Promise<void> {
    if (cell.notebook.isClosed) {
        return;
    }

    // Deep-clone so nested objects are not shared with live cell metadata
    const newMetadata = JSON.parse(JSON.stringify(cell.metadata || {}));
    newMetadata.custom = newMetadata.custom || {};
    newMetadata.custom.metadata = newMetadata.custom.metadata || {};
    newMetadata.custom.metadata.notebookRunGroups = newMetadata.custom.metadata.notebookRunGroups || {};

    // Replace the actual groupValue
    newMetadata.custom.metadata.notebookRunGroups.groupValue = newGroupValue;

    if (metadataDeepEqual(cell.metadata, newMetadata)) {
        return;
    }

    // Perform our actual replace and edit
    const wsEdit = new vscode.WorkspaceEdit();
    const notebookEdit = vscode.NotebookEdit.updateCellMetadata(cell.index, newMetadata);
    wsEdit.set(cell.notebook.uri, [notebookEdit]);
    const success = await vscode.workspace.applyEdit(wsEdit);
    if (!success) {
        log('updateCellRunGroupMetadata: applyEdit failed for cell', cell.index);
    }
}
