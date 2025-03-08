import * as vscode from 'vscode';
import { getCellTags } from '../helper';
import { log } from './logging';

/**
 * This should handle getting/setting/updating cell and notebook level metadata
 */


// Find the current active notebook document and the current active cell in it
function getCurrentActiveCell(): vscode.NotebookCell | undefined {
    const activeNotebook = vscode.window.activeNotebookEditor;

    if (activeNotebook) {
        // || is ok here as 0 index is the same as the default value
        const selectedCellIndex = activeNotebook?.selections[0]?.start || 0;

        return activeNotebook.notebook.cellCount >= 1 ? activeNotebook.notebook.cellAt(selectedCellIndex) : undefined;
    }
}

function getAllCellsFromActiveNotebook() {
    // Get the active notebook editor
    const activeNotebookEditor = vscode.window.activeNotebookEditor;

    // Check if there is an active notebook editor
    if (activeNotebookEditor) {
        // Get the notebook document from the editor
        const notebookDocument = activeNotebookEditor.notebook;
        if (notebookDocument) {
            // Retrieve all cells from the notebook document
            const cells = notebookDocument.getCells();
            // Optionally, you can log or return the cells
            log('All cells:', cells);
            return cells; // This will return an array of NotebookCell objects
        }
        else {
            log('No active notebook editor document found');
            return null;
        }
    } else {
        log('No active notebook editor found');
        return null;
    }
}
// Is the given argument a vscode NotebookCell?




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

export function getAllTagsFromActiveNotebook() {
    // Get the active notebook editor
    const activeNotebookEditor = vscode.window.activeNotebookEditor;
    // _tags: Array<string> = new Array();
    const all_tags: string[] = new Array();
    // Check if there is an active notebook editor
    if (activeNotebookEditor) {
        // Get the notebook document from the editor
        const notebookDocument = activeNotebookEditor.notebook;
        if (notebookDocument) {
            for (let i = 0; i < activeNotebookEditor.notebook.cellCount; i++) {
                const cell = activeNotebookEditor.notebook.cellAt(i);
                if (!cell) {
                    continue;
                }
                const tags = getCellTags(cell);
                tags.forEach(tag => {
                    // all_tags.includes(tag) ? null : all_tags.push(tag);
                    if (!all_tags.includes(tag)) {
                        all_tags.push(tag);
                    }
                });
            }
            log('All tags:', all_tags);
            return all_tags; // This will return an array of NotebookCell objects
        }
        else {
            log('No active notebook editor document found');
            return null;
        }
    } else {
        log('No active notebook editor found');
        return null;
    }
}

export function argNotebookCell(args: any): vscode.NotebookCell | undefined {
    // Check to see if we have a notebook cell for command context. Kinda ugly? Maybe a better way to do this.
    if (args && 'index' in args && 'kind' in args && 'notebook' in args && 'document' in args) {
        return args as vscode.NotebookCell;
    }

    log('Non-NotebookCell passed to cell based notebook group function');
    return undefined;
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

