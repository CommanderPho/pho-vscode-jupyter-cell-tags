import * as vscode from 'vscode';

export function registerJumpbackCommand(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.commands.registerCommand('jupyter-cell-tags.addJumpback', async (cell: vscode.NotebookCell) => {
    const notebookEditor = vscode.window.activeNotebookEditor;
    if (!notebookEditor) {
      vscode.window.showErrorMessage("No active notebook editor found.");
      return;
    }
    // Determine the cell index in the notebook
    const cellIndex = notebookEditor.notebook.getCells().indexOf(cell);
    if (cellIndex === -1) {
      vscode.window.showErrorMessage("Unable to determine cell index.");
      return;
    }

    // Access notebook metadata for a jumpback list. Assume metadata is a mutable object.
    const notebook = notebookEditor.notebook;
    // In practice, you may need to use the Notebook API to update notebook metadata,
    // here we simply assume we can modify a 'jumpbackList' property.
    let metadata = notebook.metadata as { jumpbackList?: any[] } || {};
    if (!metadata.jumpbackList) {
      metadata.jumpbackList = [];
    }

    // Create a new jumpback entry for the current cell.
    // You might also want to store additional information (like a timestamp).
    metadata.jumpbackList.push({
      cellIndex,
      addedAt: new Date().toISOString()
    });

    // Now update the notebook metadata.
    // Depending on your VS Code API version this could be done via a WorkspaceEdit or an API on the Notebook.
    // Below is a pseudo-code example; please adjust with your actual API.
    try {
      await vscode.workspace.applyEdit(new vscode.WorkspaceEdit()); // replace with actual metadata update method
      vscode.window.showInformationMessage(`Jumpback added for cell ${cellIndex}.`);
    } catch (error) {
      vscode.window.showErrorMessage("Failed to update notebook metadata.");
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

    // Retrieve the notebook metadata jumpback list.
    const metadata = notebookEditor.notebook.metadata as { jumpbackList?: { cellIndex: number, addedAt: string }[] } || {};
    if (!metadata.jumpbackList) {
      vscode.window.showInformationMessage(`Jumpback not set for cell ${cellIndex}.`);
      return;
    }

    // Check if the jumpback for the current cell exists.
    const index = metadata.jumpbackList.findIndex(entry => entry.cellIndex === cellIndex);
    if (index === -1) {
      vscode.window.showInformationMessage(`Jumpback not set for cell ${cellIndex}.`);
      return;
    }

    // Remove the jumpback entry.
    metadata.jumpbackList.splice(index, 1);

    try {
      // Update the metadata. Depending on the VS Code API you may need a WorkspaceEdit or a dedicated API call.
      // Here we use a placeholder for metadata update.
      await vscode.workspace.applyEdit(new vscode.WorkspaceEdit());
      vscode.window.showInformationMessage(`Removed jumpback for cell ${cellIndex}.`);
      // Optionally update the context that controls the menu item.
      vscode.commands.executeCommand('setContext', 'jupyter-cell-tags.hasJumpback', false);
    } catch (error) {
      vscode.window.showErrorMessage("Failed to update notebook metadata.");
    }
  }));
}
