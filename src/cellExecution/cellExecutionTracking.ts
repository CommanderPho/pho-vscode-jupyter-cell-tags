import * as vscode from 'vscode';
import { log } from '../util/logging';
import { getActiveCell } from '../util/notebookSelection';
import { addTagsToMultipleCells } from '../cellTags/cellTags';

interface CellExecutionRecord {
	cellIndex: number;
	executionTime: string;
	executionOrder: number;
}

interface NotebookExecutionHistory {
	executions: CellExecutionRecord[];
}

const EXECUTION_HISTORY_KEY = 'jupyter-cell-tags.executionHistory';

let sessionStartTime: Date | undefined;

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

function initializeSessionStartTime(context: vscode.ExtensionContext): void {
	if (!sessionStartTime) {
		sessionStartTime = new Date();
		log(`Session start time initialized: ${sessionStartTime.toISOString()}`);
	}
}

function getExecutedCellsForCurrentSession(context: vscode.ExtensionContext, notebookUri: vscode.Uri): number[] {
	if (!sessionStartTime) {
		initializeSessionStartTime(context);
	}
	
	const history = getExecutionHistory(context, notebookUri);
	const executedCellIndices = new Set<number>();
	
	for (const record of history.executions) {
		const executionTime = new Date(record.executionTime);
		if (executionTime >= sessionStartTime!) {
			executedCellIndices.add(record.cellIndex);
		}
	}
	
	return Array.from(executedCellIndices).sort((a, b) => a - b);
}

function generateTagName(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	const hours = String(now.getHours()).padStart(2, '0');
	const minutes = String(now.getMinutes()).padStart(2, '0');
	const seconds = String(now.getSeconds()).padStart(2, '0');
	
	return `executed-${year}-${month}-${day}-${hours}-${minutes}-${seconds}`;
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

async function createAndAddTagToAllExecutedCells(context: vscode.ExtensionContext) {
	const editor = vscode.window.activeNotebookEditor;
	if (!editor) {
		vscode.window.showWarningMessage('No active notebook editor found.');
		return;
	}
	
	if (!sessionStartTime) {
		initializeSessionStartTime(context);
	}
	
	const notebookUri = editor.notebook.uri;
	const executedCellIndices = getExecutedCellsForCurrentSession(context, notebookUri);
	
	if (executedCellIndices.length === 0) {
		vscode.window.showInformationMessage('No cells have been executed in the current session.');
		return;
	}
	
	const notebook = editor.notebook;
	const executedCells: vscode.NotebookCell[] = [];
	
	for (const cellIndex of executedCellIndices) {
		if (cellIndex >= 0 && cellIndex < notebook.cellCount) {
			const cell = notebook.cellAt(cellIndex);
			if (cell) {
				executedCells.push(cell);
			}
		}
	}
	
	if (executedCells.length === 0) {
		vscode.window.showWarningMessage('No valid executed cells found to tag.');
		return;
	}
	
	const tagName = generateTagName();
	
	try {
		await addTagsToMultipleCells(executedCells, [tagName]);
		vscode.window.showInformationMessage(`Added tag "${tagName}" to ${executedCells.length} executed cell(s).`);
		log(`Added tag "${tagName}" to ${executedCells.length} executed cells`);
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to add tag to executed cells: ${error}`);
		log(`Error adding tag to executed cells: ${error}`);
	}
}

// Register our commands for run groups
export function registerCommands(context: vscode.ExtensionContext) {
	// Initialize session start time
	initializeSessionStartTime(context);
	
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
	
	// Register create tag with executed cells command
	context.subscriptions.push(
		vscode.commands.registerCommand('jupyter-cell-tags.createAndAddTagToAllExecutedCells', () => createAndAddTagToAllExecutedCells(context))
	);
}



