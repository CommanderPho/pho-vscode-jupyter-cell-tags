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
    // const end = selection.start + cellsToSelect.length; // In VSCode's NotebookRange: the end index is exclusive (meaning it points to the position after the last element you want to include)
    const end = selection.start + cellsToSelect.length + 1;  // In VSCode's NotebookRange: the end index is exclusive (meaning it points to the position after the last element you want to include)
    notebookEditor.selection = new vscode.NotebookRange(start, end);
    vscode.window.showInformationMessage(`Selected ${cellsToSelect.length} cells under the heading "${headingText}".`);
}


async function increaseSelectionDepth() {
    const notebookEditor = vscode.window.activeNotebookEditor;
    if (!notebookEditor) {
        vscode.window.showErrorMessage('No active notebook editor found.');
        return;
    }

    const notebook = notebookEditor.notebook;
    const selection = notebookEditor.selection;
    if (!selection) {
        vscode.window.showErrorMessage('No cells are selected.');
        return;
    }

    let startIndex = selection.start;
    let endIndex = selection.end;

    // Find the first markdown heading cell in the selection
    let foundFirstHeadingCell = false;
    let initialHeadingLevel = 0;

    for (let i = startIndex; i <= endIndex; i++) {
        const cell = notebook.cellAt(i);
        if (cell.kind === vscode.NotebookCellKind.Markup) {
            const text = cell.document.getText();
            const match = text.match(/^(#+)\s+(.*)/);
            if (match) {
                initialHeadingLevel = match[1].length;
                foundFirstHeadingCell = true;
                startIndex = i; // Update start index to this cell
                break;
            }
        }
    }

    if (!foundFirstHeadingCell) {
        vscode.window.showErrorMessage('No markdown heading cell found in the selection.');
        return;
    }

    // Collect all nested markdown heading cells under the first heading
    const cellsToModify: vscode.NotebookCell[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
        const cell = notebook.cellAt(i);
        if (cell.kind === vscode.NotebookCellKind.Markup) {
            const text = cell.document.getText();
            const match = text.match(/^(#+)\s+(.*)/);
            if (match) {
                const currentHeadingLevel = match[1].length;
                if (i !== startIndex && currentHeadingLevel <= initialHeadingLevel) {
                    // Reached a heading of the same or higher level
                    break;
                }
                cellsToModify.push(cell);
            } else {
                // Non-heading markdown cell
                cellsToModify.push(cell);
            }
        } else {
            // Code cell
            cellsToModify.push(cell);
        }
    }

    // Increase heading levels in the collected markdown cells
    for (const cell of cellsToModify) {
        if (cell.kind === vscode.NotebookCellKind.Markup) {
            const text = cell.document.getText();
            const lines = text.split('\n');
            let modified = false;

            const newLines = lines.map(line => {
                const match = line.match(/^(#+)\s+(.*)/);
                if (match) {
                    // Increase heading level by adding a '#'
                    const hashes = match[1] + '#';
                    const content = match[2];
                    modified = true;
                    return `${hashes} ${content}`;
                } else {
                    return line;
                }
            });

            if (modified) {
                const newText = newLines.join('\n');
                const edit = new vscode.WorkspaceEdit();
                const range = new vscode.Range(0, 0, cell.document.lineCount, 0);
                edit.replace(cell.document.uri, range, newText);
                await vscode.workspace.applyEdit(edit);
            }
        }
    }
}

async function decreaseSelectionDepth() {
    const notebookEditor = vscode.window.activeNotebookEditor;
    if (!notebookEditor) {
        vscode.window.showErrorMessage('No active notebook editor found.');
        return;
    }

    const notebook = notebookEditor.notebook;
    const selection = notebookEditor.selection;
    if (!selection) {
        vscode.window.showErrorMessage('No cells are selected.');
        return;
    }

    let startIndex = selection.start;
    let endIndex = selection.end;

    // Find the first markdown heading cell in the selection
    let foundFirstHeadingCell = false;
    let initialHeadingLevel = 0;

    for (let i = startIndex; i <= endIndex; i++) {
        const cell = notebook.cellAt(i);
        if (cell.kind === vscode.NotebookCellKind.Markup) {
            const text = cell.document.getText();
            const match = text.match(/^(#+)\s+(.*)/);
            if (match) {
                initialHeadingLevel = match[1].length;
                foundFirstHeadingCell = true;
                startIndex = i; // Update start index to this cell
                break;
            }
        }
    }

    if (!foundFirstHeadingCell) {
        vscode.window.showErrorMessage('No markdown heading cell found in the selection.');
        return;
    }

    // Collect all nested markdown heading cells under the first heading
    const cellsToModify: vscode.NotebookCell[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
        const cell = notebook.cellAt(i);
        if (cell.kind === vscode.NotebookCellKind.Markup) {
            const text = cell.document.getText();
            const match = text.match(/^(#+)\s+(.*)/);
            if (match) {
                const currentHeadingLevel = match[1].length;
                if (i !== startIndex && currentHeadingLevel <= initialHeadingLevel) {
                    // Reached a heading of the same or higher level
                    break;
                }
                cellsToModify.push(cell);
            } else {
                // Non-heading markdown cell
                cellsToModify.push(cell);
            }
        } else {
            // Code cell
            cellsToModify.push(cell);
        }
    }

    // Decrease heading levels in the collected markdown cells
    for (const cell of cellsToModify) {
        if (cell.kind === vscode.NotebookCellKind.Markup) {
            const text = cell.document.getText();
            const lines = text.split('\n');
            let modified = false;

            const newLines = lines.map(line => {
                const match = line.match(/^(#+)\s+(.*)/);
                if (match) {
                    const headingLevel = match[1].length;
                    if (headingLevel > 1) {
                        // Decrease heading level by removing one '#'
                        const hashes = match[1].substring(1);
                        const content = match[2];
                        modified = true;
                        return `${hashes} ${content}`;
                    } else {
                        // Heading level is 1, remove '#' to make it normal text
                        const content = match[2];
                        modified = true;
                        return content;
                    }
                } else {
                    return line;
                }
            });

            if (modified) {
                const newText = newLines.join('\n');
                const edit = new vscode.WorkspaceEdit();
                const range = new vscode.Range(0, 0, cell.document.lineCount, 0);
                edit.replace(cell.document.uri, range, newText);
                await vscode.workspace.applyEdit(edit);
            }
        }
    }
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
    const increaseSelectionHeadingDepthCommand = vscode.commands.registerCommand('jupyter-cell-tags.increaseSelectionHeadingDepth', increaseSelectionDepth);
    const decreaseSelectionHeadingDepthCommand = vscode.commands.registerCommand('jupyter-cell-tags.decreaseSelectionHeadingDepth', decreaseSelectionDepth);

    context.subscriptions.push(deleteCommand, selectCommand, increaseSelectionHeadingDepthCommand, decreaseSelectionHeadingDepthCommand);

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
