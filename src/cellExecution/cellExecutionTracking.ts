import * as vscode from 'vscode';
import { log } from '../util/logging';
import { getActiveCell } from '../util/notebookSelection';

interface CellExecutionRecord {
	cellIndex: number;
	executionTime: string;
	executionOrder: number;
}

interface NotebookExecutionHistory {
	executions: CellExecutionRecord[];
}

const EXECUTION_HISTORY_KEY = 'jupyter-cell-tags.executionHistory';

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

function recordCellExecution(context: vscode.ExtensionContext, notebookUri: vscode.Uri, cellIndex: number, executionTime: Date): void {
	const history = getExecutionHistory(context, notebookUri);
	const executionOrder = history.executions.length + 1;
	
	const record: CellExecutionRecord = {
		cellIndex,
		executionTime: executionTime.toISOString(),
		executionOrder
	};
	
	history.executions.push(record);
	
	const allHistory = context.globalState.get<Record<string, NotebookExecutionHistory>>(EXECUTION_HISTORY_KEY, {});
	allHistory[notebookUri.toString()] = history;
	context.globalState.update(EXECUTION_HISTORY_KEY, allHistory);
	
	log(`Recorded execution: Cell ${cellIndex} at ${executionTime.toISOString()} (order: ${executionOrder})`);
}

function getExecutionHistory(context: vscode.ExtensionContext, notebookUri: vscode.Uri): NotebookExecutionHistory {
	const allHistory = context.globalState.get<Record<string, NotebookExecutionHistory>>(EXECUTION_HISTORY_KEY, {});
	const uriString = notebookUri.toString();
	
	if (!allHistory[uriString]) {
		allHistory[uriString] = { executions: [] };
	}
	
	return allHistory[uriString];
}

export function getExecutionHistoryForNotebook(context: vscode.ExtensionContext, notebookUri: vscode.Uri): CellExecutionRecord[] {
	const history = getExecutionHistory(context, notebookUri);
	return history.executions;
}

async function executeAndSelectBelowWithTracking(context: vscode.ExtensionContext) {
	const editor = vscode.window.activeNotebookEditor;
	if (!editor) {
		log('No active notebook editor found for execution tracking');
		return;
	}
	
	const activeCell = getActiveCell();
	if (!activeCell) {
		log('No active cell found for execution tracking');
		return;
	}
	
	const executionTime = new Date();
	const notebookUri = editor.notebook.uri;
	
	recordCellExecution(context, notebookUri, activeCell.index, executionTime);
	
	await vscode.commands.executeCommand('notebook.cell.executeAndSelectBelow');
}

async function executeAndFocusContainerWithTracking(context: vscode.ExtensionContext) {
	const editor = vscode.window.activeNotebookEditor;
	if (!editor) {
		log('No active notebook editor found for execution tracking');
		return;
	}
	
	const activeCell = getActiveCell();
	if (!activeCell) {
		log('No active cell found for execution tracking');
		return;
	}
	
	const executionTime = new Date();
	const notebookUri = editor.notebook.uri;
	
	recordCellExecution(context, notebookUri, activeCell.index, executionTime);
	
	await vscode.commands.executeCommand('notebook.cell.executeAndFocusContainer');
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

	// Register execution tracking commands
	context.subscriptions.push(
		vscode.commands.registerCommand('jupyter-cell-tags.executeAndSelectBelowWithTracking', () => executeAndSelectBelowWithTracking(context))
	);
	
	context.subscriptions.push(
		vscode.commands.registerCommand('jupyter-cell-tags.executeAndFocusContainerWithTracking', () => executeAndFocusContainerWithTracking(context))
	);
}



