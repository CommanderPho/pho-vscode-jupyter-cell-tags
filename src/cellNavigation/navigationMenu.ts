import * as vscode from 'vscode';
import { navigateToPreviousExecutedCell, navigateToNextExecutedCell } from '../cellExecution/cellExecutionTracking';
import { getCellExecutionStatus } from '../cellExecution/cellExecutionTracking';
import { getActiveCell } from '../util/notebookSelection';
import { log } from '../util/logging';

async function navigateToPreviousErrorCell(context: vscode.ExtensionContext) {
	const editor = vscode.window.activeNotebookEditor;
	if (!editor) {
		vscode.window.showWarningMessage('No active notebook editor found.');
		return;
	}
	
	const activeCell = getActiveCell();
	if (!activeCell) {
		vscode.window.showWarningMessage('No active cell found.');
		return;
	}
	
	const notebook = editor.notebook;
	const currentCellIndex = activeCell.index;
	
	// Find all cells with errors
	const errorCellIndices: number[] = [];
	for (let i = 0; i < notebook.cellCount; i++) {
		const cell = notebook.cellAt(i);
		if (getCellExecutionStatus(cell) === 'error') {
			errorCellIndices.push(i);
		}
	}
	
	if (errorCellIndices.length === 0) {
		vscode.window.showInformationMessage('No error cells found in this notebook.');
		return;
	}
	
	// Find the previous error cell (highest index that is less than current cell index)
	let previousErrorIndex = -1;
	for (let i = errorCellIndices.length - 1; i >= 0; i--) {
		if (errorCellIndices[i] < currentCellIndex) {
			previousErrorIndex = errorCellIndices[i];
			break;
		}
	}
	
	if (previousErrorIndex === -1) {
		vscode.window.showInformationMessage('No previous error cell found.');
		return;
	}
	
	// Navigate to the previous error cell
	const range = new vscode.NotebookRange(previousErrorIndex, previousErrorIndex + 1);
	editor.selection = range;
	await editor.revealRange(range, vscode.NotebookEditorRevealType.AtTop);
	log(`Navigated to previous error cell at index ${previousErrorIndex}`);
}

async function navigateToNextErrorCell(context: vscode.ExtensionContext) {
	const editor = vscode.window.activeNotebookEditor;
	if (!editor) {
		vscode.window.showWarningMessage('No active notebook editor found.');
		return;
	}
	
	const activeCell = getActiveCell();
	if (!activeCell) {
		vscode.window.showWarningMessage('No active cell found.');
		return;
	}
	
	const notebook = editor.notebook;
	const currentCellIndex = activeCell.index;
	
	// Find all cells with errors
	const errorCellIndices: number[] = [];
	for (let i = 0; i < notebook.cellCount; i++) {
		const cell = notebook.cellAt(i);
		if (getCellExecutionStatus(cell) === 'error') {
			errorCellIndices.push(i);
		}
	}
	
	if (errorCellIndices.length === 0) {
		vscode.window.showInformationMessage('No error cells found in this notebook.');
		return;
	}
	
	// Find the next error cell (lowest index that is greater than current cell index)
	let nextErrorIndex = -1;
	for (let i = 0; i < errorCellIndices.length; i++) {
		if (errorCellIndices[i] > currentCellIndex) {
			nextErrorIndex = errorCellIndices[i];
			break;
		}
	}
	
	if (nextErrorIndex === -1) {
		vscode.window.showInformationMessage('No next error cell found.');
		return;
	}
	
	// Navigate to the next error cell
	const range = new vscode.NotebookRange(nextErrorIndex, nextErrorIndex + 1);
	editor.selection = range;
	await editor.revealRange(range, vscode.NotebookEditorRevealType.AtTop);
	log(`Navigated to next error cell at index ${nextErrorIndex}`);
}

async function showNavigationMenu(context: vscode.ExtensionContext) {
	const config = vscode.workspace.getConfiguration('jupyter-cell-tags');
	const enableErrorNavigation = config.get<boolean>('enableErrorNavigation', false);
	
	const items: vscode.QuickPickItem[] = [
		{
			label: '$(arrow-up) Navigate to Previous Executed Cell',
			description: 'Go to the previous executed cell',
			detail: 'Navigate up to the most recently executed cell above the current position'
		},
		{
			label: '$(arrow-down) Navigate to Next Executed Cell',
			description: 'Go to the next executed cell',
			detail: 'Navigate down to the next executed cell below the current position'
		}
	];
	
	if (enableErrorNavigation) {
		items.push(
			{
				label: '$(arrow-up) Navigate Up to Previous Error Cell',
				description: 'Go to the previous cell with an error',
				detail: 'Navigate up to the most recent error cell above the current position'
			},
			{
				label: '$(arrow-down) Navigate Down to Next Error Cell',
				description: 'Go to the next cell with an error',
				detail: 'Navigate down to the next error cell below the current position'
			}
		);
	}
	
	const selected = await vscode.window.showQuickPick(items, {
		placeHolder: 'Select navigation option'
	});
	
	if (!selected) {
		return;
	}
	
	if (selected.label.includes('Previous Executed Cell')) {
		await navigateToPreviousExecutedCell(context);
	} else if (selected.label.includes('Next Executed Cell')) {
		await navigateToNextExecutedCell(context);
	} else if (selected.label.includes('Previous Error Cell')) {
		await navigateToPreviousErrorCell(context);
	} else if (selected.label.includes('Next Error Cell')) {
		await navigateToNextErrorCell(context);
	}
}

export function registerNavigationMenu(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('jupyter-cell-tags.showNavigationMenu', () => showNavigationMenu(context))
	);
	
	// Register individual error navigation commands for backward compatibility
	context.subscriptions.push(
		vscode.commands.registerCommand('jupyter-cell-tags.navigateUpToPreviousErrorCell', () => navigateToPreviousErrorCell(context))
	);
	
	context.subscriptions.push(
		vscode.commands.registerCommand('jupyter-cell-tags.navigateDownToNextErrorCell', () => navigateToNextErrorCell(context))
	);
}
