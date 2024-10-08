import * as vscode from 'vscode';


function isCellHeading(cell: vscode.NotebookCell): boolean {
    if (cell.kind === vscode.NotebookCellKind.Markup) {
        const match = cell.document.getText().match(/^(#+)\s+/);
        if (match) {
            const headingLevel = match[1].length;
            // return headingLevel;
            return (headingLevel > 0);
        }
    }
    return false;
    // return cell.kind === vscode.NotebookCellKind.Markup && cell.document.getText().startsWith('#');
}


function getCellsUnderHeading(notebook: vscode.NotebookDocument, startIndex: number, headingLevel: number): vscode.NotebookCell[] {
    const cells: vscode.NotebookCell[] = [];
    for (let i = startIndex + 1; i < notebook.cellCount; i++) {
        const cell = notebook.cellAt(i);
        if (!cell) {
            continue;
        }
        if (cell.kind === vscode.NotebookCellKind.Markup) {
            const match = cell.document.getText().match(/^(#+)\s+/);
            if (match) {
                const currentLevel = match[1].length;
                if (currentLevel <= headingLevel) {
                    break; // Reached a heading that is same or higher level
                }
            }
        }
        cells.push(cell);
    }
    return cells;
}

// const cellsUnderHeading = getCellsUnderHeading(notebook, selection.start, headingLevel);


function selectCellsUnderHeading() {
    const notebookEditor = vscode.window.activeNotebookEditor;
    if (!notebookEditor) {
        vscode.window.showErrorMessage('No active notebook editor found.');
        return;
    }

    const notebook = notebookEditor.notebook;
    const selection = notebookEditor.selection;
    if (!selection) {
        vscode.window.showErrorMessage('No cell is selected.');
        return;
    }

    const selectedCell = notebook.cellAt(selection.start);
    if (selectedCell.kind !== vscode.NotebookCellKind.Markup) {
        vscode.window.showErrorMessage('Selected cell is not a markdown cell.');
        return;
    }

    const headingMatch = selectedCell.document.getText().match(/^(#+)\s+(.*)/);
    if (!headingMatch) {
        vscode.window.showErrorMessage('Selected markdown cell does not contain a heading.');
        return;
    }

    const headingLevel = headingMatch[1].length;
    const headingText = headingMatch[1].valueOf();
    const cellsToSelect = getCellsUnderHeading(notebook, selection.start, headingLevel);

    if (cellsToSelect.length === 0) {
        vscode.window.showInformationMessage('No cells to select under the selected heading.');
        return;
    }

    const start = selection.start + 1;
    const end = selection.start + cellsToSelect.length;

    notebookEditor.selection = new vscode.NotebookRange(start, end);
    vscode.window.showInformationMessage(`Selected ${cellsToSelect.length} cells under the heading "${headingText}".`);
}

async function deleteCellsUnderHeading() {
    const notebookEditor = vscode.window.activeNotebookEditor;
    // if (!notebookEditor) {
    //     vscode.window.showErrorMessage('No active notebook editor found.');
    //     return;
    // }

    // const notebook = notebookEditor.notebook;
    // const selection = notebookEditor.selection;
    // if (!selection) {
    //     vscode.window.showErrorMessage('No cell is selected.');
    //     return;
    // }

    // const selectedCell = notebook.cellAt(selection.start);
    // if (selectedCell.kind !== vscode.NotebookCellKind.Markup) {
    //     vscode.window.showErrorMessage('Selected cell is not a markdown cell.');
    //     return;
    // }

    // const headingMatch = selectedCell.document.getText().match(/^(#+)\s+(.*)/);
    // if (!headingMatch) {
    //     vscode.window.showErrorMessage('Selected markdown cell does not contain a heading.');
    //     return;
    // }

    // const headingLevel = headingMatch[1].length;
    // const headingText = headingMatch[1].valueOf();
    // const cellsToDelete = getCellsUnderHeading(notebook, selection.start, headingLevel);

    // if (cellsToDelete.length === 0) {
    //     vscode.window.showInformationMessage('No cells to delete under the selected heading.');
    //     return;
    // }

    // const edit = new vscode.WorkspaceEdit();
    // cellsToDelete.forEach(cell => {
    //     // cell.index

    //     edit.delete(notebook.uri, cell.index);
    //     // edit.deleteNotebookCell(notebook.uri, notebook.cells.indexOf(cell));
    //     // vscode.Range.create(cell.document.range.start, cell.document.rangeIncludingLineBreak.end);
    //     notebook.getCells().indexOf(cell)
    // });

    // await vscode.workspace.applyEdit(edit);
    // vscode.window.showInformationMessage(`Deleted ${cellsToDelete.length} cells under the heading "${headingText}".`);
}


// Register our commands for run groups
export function registerCommands(context: vscode.ExtensionContext) {

    const deleteCommand = vscode.commands.registerCommand('jupyter-cell-tags.deleteCellsUnderHeading', deleteCellsUnderHeading);
    const selectCommand = vscode.commands.registerCommand('jupyter-cell-tags.selectCellsUnderHeading', selectCellsUnderHeading);

    context.subscriptions.push(deleteCommand, selectCommand);

    // context.subscriptions.push(
    //     vscode.commands.registerCommand('jupyter-cell-tags.selectCellsUnderHeading', (args) => {
    //         selectCellsUnderHeading();
    //     })
    // );
    // context.subscriptions.push(
    //     vscode.commands.registerCommand('jupyter-cell-tags.deleteCellsUnderHeading', (args) => {
    //         deleteCellsUnderHeading();
    //     })
    // );
}
