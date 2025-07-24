import * as vscode from 'vscode';
import { log } from '../util/logging';

async function getJupyterAPI() {
    const jupyterExtension = vscode.extensions.getExtension('ms-toolsai.jupyter');
    if (!jupyterExtension) {
        throw new Error('Jupyter extension is not installed or not enabled.');
    }
    if (!jupyterExtension.isActive) {
        await jupyterExtension.activate();
    }
    return jupyterExtension.exports;
}

async function getExecutedCells() {
    const jupyterAPI = await getJupyterAPI();

    // Get the active notebook editor
    const notebookEditor = vscode.window.activeNotebookEditor;
    if (!notebookEditor) {
        vscode.window.showErrorMessage('No active notebook editor found.');
        return [];
    }

    // Access the notebook document
    const notebook = notebookEditor.notebook;

    // Filter for executed cells
    const executedCells = notebook.getCells().filter(cell => {
        // Check the metadata for execution status
        return cell.metadata?.execution || cell.outputs.length > 0;
    });

    return executedCells;
}


async function showExecutedCells() {
    const executedCells = await getExecutedCells();
    if (executedCells.length === 0) {
        vscode.window.showInformationMessage('No executed cells found.');
    } else {
        vscode.window.showInformationMessage(`Found ${executedCells.length} executed cells.`);
    }

    executedCells.forEach(cell => {
        log(`Cell Index: ${cell.index}, Content: ${cell.document.getText()}`);
    });
}


// Register our commands for run groups
export function registerCommands(context: vscode.ExtensionContext) {
	// // Register add commands

	// Register execute commands
	context.subscriptions.push(
		vscode.commands.registerCommand('jupyter-cell-tags.listExecutedNotebookCells', async (args) => {
			// const tag = await quickPickAllTags();
			showExecutedCells();
		})
	);

}



