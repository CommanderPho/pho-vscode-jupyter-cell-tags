import * as vscode from 'vscode';
import { addCellTag } from './cellTags/cellTags';


export async function newCellWithCreationDate() {
    const activeEditor = vscode.window.activeNotebookEditor;
    if (!activeEditor) {
        vscode.window.showErrorMessage('No notebook editor is active');
        return;
    }
    
    // At this point, TypeScript knows activeEditor is a vscode.NotebookEditor
    const editor: vscode.NotebookEditor = activeEditor;

    // Get the active cell or default to the first cell
    const activeCell = editor.selections.length > 0 
        ? editor.notebook.cellAt(editor.selections[0].start)
        : editor.notebook.cellAt(0);
    
    if (!activeCell) {
        vscode.window.showErrorMessage('No active cell found');
        return;
    }

    // Find the index of the active cell
    const activeCellIndex = editor.notebook.getCells().findIndex(cell => cell === activeCell);
    
    

    // Create a new cell after the active cell
    const wsEdit = new vscode.WorkspaceEdit();
    const cellData = new vscode.NotebookCellData(
        vscode.NotebookCellKind.Code,
        '',
        'python'
    );

    // Insert the new cell after the active cell
    const notebookEdit = vscode.NotebookEdit.insertCells((activeCellIndex+1), [cellData]);
    wsEdit.set(editor.notebook.uri, [notebookEdit]);

    // wsEdit.insert(editor.notebook.uri,
    //     new vscode.NotebookRange(activeCellIndex + 1, activeCellIndex + 1),

    
    // )
    // wsEdit.replace(
    //     editor.notebook.uri,
    //     new vscode.NotebookRange(activeCellIndex + 1, activeCellIndex + 1),
    //     [cellData]
    // );
    
    // Apply the edit
    await vscode.workspace.applyEdit(wsEdit);
    
    // Get the newly created cell
    const newCellIndex = activeCellIndex + 1;
    const newCell = editor.notebook.cellAt(newCellIndex);
    
    // Create a tag with current date in ISO format
    const now = new Date();
    const dateString = now.toISOString().split('T')[0]; // YYYY-MM-DD format
    const tagName = `created-${dateString}`;
    
    // Add the tag to the new cell
    await addCellTag(newCell, [tagName]);

    // Select the new cell
    editor.selections = [new vscode.NotebookRange(newCellIndex, newCellIndex)];
    
    // Focus the new cell
    editor.revealRange(new vscode.NotebookRange(newCellIndex, newCellIndex));
    
    vscode.window.showInformationMessage(`Created new cell with tag "${tagName}"`);
}


// Register our commands
export function registerBasicOperationCommands(context: vscode.ExtensionContext) {


    context.subscriptions.push(
        vscode.commands.registerCommand('jupyter-cell-tags.newCellWithCreationDate', newCellWithCreationDate)
    );

}


