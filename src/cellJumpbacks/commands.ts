import * as vscode from 'vscode';
import { getActiveCell, reviveCell } from '../util/notebookSelection';
import { updateNotebookMetadata, getNotebookMetadata } from '../util/notebookMetadata';
import { JumpbackEntry } from './jumpbackDataSource';


export function registerJumpbackCommand(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.commands.registerCommand('jupyter-cell-tags.addJumpback', async (cell: vscode.NotebookCell | vscode.Uri | undefined) => {


    cell = reviveCell(cell);
    if (!cell) {
        return;
    }


    const notebookEditor = vscode.window.activeNotebookEditor;
    if (!notebookEditor) {
      vscode.window.showErrorMessage("No active notebook editor found.");
      return;
    }


    // let activeCell: vscode.NotebookCell | undefined;
    // if (typeof cell === 'string') {
    //     // find active cell
    //     activeCell = getActiveCell();
    // } else {
    //     activeCell = cell;
    // }

    // if (!activeCell) {
    //     return;
    // }




    // Determine the cell index in the notebook
    const cellIndex = notebookEditor.notebook.getCells().indexOf(cell);
    if (cellIndex === -1) {
      vscode.window.showErrorMessage("Unable to determine cell index.");
      return;
    }

    // Get the current jumpback list from notebook metadata
    const notebook = notebookEditor.notebook;
    const currentJumpbackList = getNotebookMetadata<JumpbackEntry[]>(notebook, ['jumpbackList'], []);
    
    // Check if jumpback already exists for this cell
    const existingIndex = currentJumpbackList.findIndex(entry => entry.cellIndex === cellIndex);
    if (existingIndex !== -1) {
      vscode.window.showInformationMessage(`Jumpback already exists for cell ${cellIndex}.`);
      return;
    }

    // Create a new jumpback entry for the current cell
    const newJumpback: JumpbackEntry = {
      cellIndex,
      addedAt: new Date().toISOString()
    };

    // Add the new jumpback to the list
    const updatedJumpbackList = [...currentJumpbackList, newJumpback];

    // Update the notebook metadata
    try {
      await updateNotebookMetadata(notebook, ['jumpbackList'], updatedJumpbackList);
      vscode.window.showInformationMessage(`Jumpback added for cell ${cellIndex}.`);
    } catch (error) {
      const errorMsg = `Failed to update notebook metadata: ${error}`;
      vscode.window.showErrorMessage(errorMsg);
      console.error(errorMsg, error);
    }
  }));
}

export function registerRemoveJumpbackCommand(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.commands.registerCommand('jupyter-cell-tags.removeJumpback', async (cell: vscode.NotebookCell) => {
    const notebookEditor = vscode.window.activeNotebookEditor;
    if (!notebookEditor) {
      vscode.window.showErrorMessage("No active notebook editor found.");
      return;
    }
    const cells = notebookEditor.notebook.getCells();
    const cellIndex = cells.indexOf(cell);
    if (cellIndex === -1) {
      vscode.window.showErrorMessage("Unable to determine cell index.");
      return;
    }

    // Retrieve the notebook metadata jumpback list
    const notebook = notebookEditor.notebook;
    const currentJumpbackList = getNotebookMetadata<JumpbackEntry[]>(notebook, ['jumpbackList'], []);
    
    if (currentJumpbackList.length === 0) {
      vscode.window.showInformationMessage(`Jumpback not set for cell ${cellIndex}.`);
      return;
    }

    // Check if the jumpback for the current cell exists
    const index = currentJumpbackList.findIndex(entry => entry.cellIndex === cellIndex);
    if (index === -1) {
      vscode.window.showInformationMessage(`Jumpback not set for cell ${cellIndex}.`);
      return;
    }

    // Remove the jumpback entry
    const updatedJumpbackList = currentJumpbackList.filter((_, i) => i !== index);

    try {
      // Update the notebook metadata
      await updateNotebookMetadata(notebook, ['jumpbackList'], updatedJumpbackList);
      vscode.window.showInformationMessage(`Removed jumpback for cell ${cellIndex}.`);
      // Update the context that controls the menu item
      vscode.commands.executeCommand('setContext', 'jupyter-cell-tags.hasJumpback', false);
    } catch (error) {
      const errorMsg = `Failed to update notebook metadata: ${error}`;
      vscode.window.showErrorMessage(errorMsg);
      console.error(errorMsg, error);
    }
  }));
}
