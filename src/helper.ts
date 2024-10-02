// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';

// export const myOutputChannel = vscode.window.createOutputChannel("Pho Hale Extension - Jupyter Cell Tags");
// myOutputChannel.appendLine("This is a log message from my extension");
// myOutputChannel.show(true);


export function getCellTags(cell: vscode.NotebookCell): string[] {
    const currentTags =
        (useCustomMetadata() ? cell.metadata.custom?.metadata?.tags : cell.metadata.metadata?.tags) ?? [];
    return [...currentTags];
}

export async function updateCellTags(cell: vscode.NotebookCell, tags: string[]) {
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
    const edit = new vscode.WorkspaceEdit();
    const nbEdit = vscode.NotebookEdit.updateCellMetadata(cell.index, sortObjectPropertiesRecursively(metadata));
    edit.set(cell.notebook.uri, [nbEdit]);
    await vscode.workspace.applyEdit(edit);
}

function useCustomMetadata() {
    if (vscode.extensions.getExtension('vscode.ipynb')?.exports.dropCustomMetadata) {
        return false;
    }
    return true;
}


/**
 * Sort the JSON to minimize unnecessary SCM changes.
 * Jupyter notbeooks/labs sorts the JSON keys in alphabetical order.
 * https://github.com/microsoft/vscode/issues/208137
 */
function sortObjectPropertiesRecursively(obj: any): any {
	if (Array.isArray(obj)) {
		return obj.map(sortObjectPropertiesRecursively);
	}
	if (obj !== undefined && obj !== null && typeof obj === 'object' && Object.keys(obj).length > 0) {
		return (
			Object.keys(obj)
				.sort()
				.reduce<Record<string, any>>((sortedObj, prop) => {
					sortedObj[prop] = sortObjectPropertiesRecursively(obj[prop]);
					return sortedObj;
				}, {}) as any
		);
	}
	return obj;
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

export function countSelectedCells(selections: readonly vscode.NotebookRange[]): number {
    let total_num_selected_cells = 0;
    selections.forEach(selection => {
        const range = selection as vscode.NotebookRange;
        if (!range.isEmpty) {
            const num_selected_cells = range.end - range.start;
            total_num_selected_cells += num_selected_cells;
        }
    });
    return total_num_selected_cells;
}


// Add functions refactored from `cellTags.ts`
export async function addCellTag(cell: vscode.NotebookCell, tags: string[]) {
    const oldTags = getCellTags(cell);
    const newTags: string[] = [];
    for (const tag of tags) {
        if (!oldTags.includes(tag)) {
            newTags.push(tag);
        }
    }
    if (newTags.length) {
        oldTags.push(...newTags);
    }

    await updateCellTags(cell, oldTags);
}

export async function addTagsToMultipleCells(cells: vscode.NotebookCell[], tags: string[]) {
    for (const cell of cells) {
        await addCellTag(cell, tags);
    }
}

/* ================================================================================================================== */
/* Get/"Revive"? cells                                                                                                */
/* ================================================================================================================== */
export function getActiveCell() {
    // find active cell
    const editor = vscode.window.activeNotebookEditor;
    if (!editor) {
        return;
    }

    if (editor.selections[0].start >= editor.notebook.cellCount) {
        return;
    }

    return editor.notebook.cellAt(editor.selections[0].start);
}


export function getActiveCells(): vscode.NotebookCell[] | undefined {
    const editor = vscode.window.activeNotebookEditor;
    if (!editor) {
        return;
    }

    let cells: vscode.NotebookCell[] = [];
    for (const selection of editor.selections) {
        cells = cells.concat(editor.notebook.getCells(selection));
    }
    return cells.length > 0 ? cells : undefined;
}


export function reviveCell(args: vscode.NotebookCell | vscode.Uri | undefined): vscode.NotebookCell | undefined {
    if (!args) {
        return getActiveCell();
    }

    if (args && 'index' in args && 'kind' in args && 'notebook' in args && 'document' in args) {
        return args as vscode.NotebookCell;
    }

    if (args && 'scheme' in args && 'path' in args) {
        const cellUri = vscode.Uri.from(args);
        const cellUriStr = cellUri.toString();
        let activeCell: vscode.NotebookCell | undefined = undefined;

        for (const document of vscode.workspace.notebookDocuments) {
            for (const cell of document.getCells()) {
                if (cell.document.uri.toString() === cellUriStr) {
                    activeCell = cell;
                    break;
                }
            }

            if (activeCell) {
                break;
            }
        }

        return activeCell;
    }

    return undefined;
}
