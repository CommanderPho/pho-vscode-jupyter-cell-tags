import * as vscode from 'vscode';
// import { getCellRunGroupMetadata, updateCellRunGroupMetadata } from './util/cellMetadataHelpers';
// import { updateContextKeys } from './contextKeys';
// import { RunGroup } from './enums';
import { log } from './logging';
import { getCellTags } from '../../helper';


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
            console.log('All cells:', cells);
            return cells;  // This will return an array of NotebookCell objects
        }
        else {
            console.log('No active notebook editor document found');
            return null;
        }
    } else {
        console.log('No active notebook editor found');
        return null;
    }
}

// Is the given argument a vscode NotebookCell?
export function argNotebookCell(args: any): vscode.NotebookCell | undefined {
    // Check to see if we have a notebook cell for command context. Kinda ugly? Maybe a better way to do this.
    if (args && 'index' in args && 'kind' in args && 'notebook' in args && 'document' in args) {
        return args as vscode.NotebookCell;
    }

    log('Non-NotebookCell passed to cell based notebook group function');
    return undefined;
}

// Execute the given target run group. If a cell is specified use that document, if not find the active doc
export function executeGroup(targetRunTag: string, notebookCell?: vscode.NotebookCell) {
    let doc = notebookCell?.notebook; // get the document from the context cell
    // If we didn't get a cell passed in, just take the active documents
    if (!doc) {
        doc = vscode.window.activeNotebookEditor?.notebook;
        doc || log('Execute group called without a valid document to execute');
    }

    // Collect our cell indexes
    const targetCells = doc
        ?.getCells()
        .filter((notebookCell) => cellInGroup(notebookCell, targetRunTag))
        .map((cell) => {
            console.log(`Cell at index ${cell.index}:`);
            console.log(`Cell kind: ${cell.kind === vscode.NotebookCellKind.Code ? 'Code' : 'Markdown'}`);
            console.log(`Cell content: ${cell.document.getText()}`);
            return { start: cell.index, end: cell.index + 1 };
        });

    // log(targetCells);
    // Execute the cells
    vscode.commands.executeCommand('notebook.cell.execute', { ranges: targetCells });
    log('done executing');

}

// Determine if a cell is in a given run group
function cellInGroup(cell: vscode.NotebookCell, targetCellTag: string) {
    // const currentValue = getCellRunGroupMetadata(cell);
    const tags = getCellTags(cell);
    if (tags.includes(targetCellTag)) {
        return true;
    }
    return false;
}

// // For the target cell, add it to the given run group
// function addToGroup(targetRunGroup: RunGroup, notebookCell?: vscode.NotebookCell) {
//     // If we were not passed in a cell, look for one
//     if (!notebookCell) {
//         notebookCell = getCurrentActiveCell();
//         if (!notebookCell) {
//             return;
//         }
//     }

//     addGroupToCustomMetadata(notebookCell, targetRunGroup);

//     // Always update the context keys and cell status after add / remove
//     updateContextKeys();
// }

// // Remove the given cell from the specified run group
// function removeFromGroup(targetRunGroup: RunGroup, notebookCell?: vscode.NotebookCell) {
//     // If we were not passed in a cell, look for one
//     if (!notebookCell) {
//         notebookCell = getCurrentActiveCell();
//         if (!notebookCell) {
//             return;
//         }
//     }

//     removeGroupFromCustomMetadata(notebookCell, targetRunGroup);

//     // Always update the context keys and cell status after add / remove
//     updateContextKeys();
// }



// function removeGroupFromCustomMetadata(notebookCell: vscode.NotebookCell, targetRunGroup: RunGroup) {
//     const currentValue = getCellRunGroupMetadata(notebookCell);

//     if (!currentValue.includes(targetRunGroup.toString())) {
//         // Not there, can't remove
//         log('Given run group is not present, so cannot be removed from.');
//         return;
//     }

//     // Add in our group value and update the cell metadata
//     const newValue = currentValue.replace(targetRunGroup.toString(), '');
//     updateCellRunGroupMetadata(notebookCell, newValue);

//     log(`Removing from group Cell Index: ${notebookCell.index} Groups Value: ${targetRunGroup.toString()}`);
// }

// function addGroupToCustomMetadata(notebookCell: vscode.NotebookCell, targetRunGroup: RunGroup) {
//     const currentValue = getCellRunGroupMetadata(notebookCell);

//     if (currentValue.includes(targetRunGroup.toString())) {
//         // Already there, return
//         log('Attempted to add cell to a group it is already in');
//         return;
//     }

//     // Add in our group value
//     const newValue = currentValue.concat(targetRunGroup.toString());
//     updateCellRunGroupMetadata(notebookCell, newValue);

//     log(`Adding to group Cell Index: ${notebookCell.index} Groups Value: ${newValue}`);
// }
