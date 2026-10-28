// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { sortObjectPropertiesRecursively, useCustomMetadata } from './util/notebookMetadata';

// export const myOutputChannel = vscode.window.createOutputChannel("Pho Hale Extension - Jupyter Cell Tags");
// myOutputChannel.appendLine("This is a log message from my extension");
// myOutputChannel.show(true);

export const MICROSOFT_JUPYTER_CELL_TAGS_ID = 'ms-toolsai.vscode-jupyter-cell-tags';

export type ConflictingExtensionResult = 'absent' | 'uninstalled' | 'failed';

const RELOAD_WINDOW = 'Reload Window';
const MANUAL_UNINSTALL_MESSAGE =
    'Official Microsoft Jupyter Cell Tags extension ("ms-toolsai.vscode-jupyter-cell-tags") detected! Please manually uninstall the official version in the VSCode Extensions tab to use the phohale version ("phohale.pho-vscode-jupyter-cell-tags")!.';
const UNINSTALLED_MESSAGE =
    'Uninstalled the official Microsoft Jupyter Cell Tags extension ("ms-toolsai.vscode-jupyter-cell-tags"). It ships with Jupyter and conflicts with this fork ("phohale.pho-vscode-jupyter-cell-tags"). Reload the window to finish.';

let _uninstallInFlight: Promise<ConflictingExtensionResult> | undefined;
let _uninstalledThisSession = false;

export async function uninstallConflictingMicrosoftExtension(): Promise<ConflictingExtensionResult> {
    if (_uninstallInFlight) {
        return _uninstallInFlight;
    }
    _uninstallInFlight = _uninstallConflictingMicrosoftExtension();
    try {
        return await _uninstallInFlight;
    } finally {
        _uninstallInFlight = undefined;
    }
}

async function _uninstallConflictingMicrosoftExtension(): Promise<ConflictingExtensionResult> {
    const incompatible_extension = vscode.extensions.getExtension(MICROSOFT_JUPYTER_CELL_TAGS_ID);
    if (!incompatible_extension) {
        _uninstalledThisSession = false;
        return 'absent';
    }
    if (_uninstalledThisSession) {
        return 'uninstalled';
    }
    try {
        await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', MICROSOFT_JUPYTER_CELL_TAGS_ID);
        _uninstalledThisSession = true;
        void vscode.window.showInformationMessage(UNINSTALLED_MESSAGE, RELOAD_WINDOW).then((selection) => {
            if (selection === RELOAD_WINDOW) {
                return vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        });
        return 'uninstalled';
    } catch {
        vscode.window.showErrorMessage(MANUAL_UNINSTALL_MESSAGE);
        return 'failed';
    }
}


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

