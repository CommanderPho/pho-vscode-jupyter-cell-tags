// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import * as vscode from 'vscode';
import { registerCommands, recordCellExecution } from './cellExecutionTracking';
import { register as registerExecutedCellsView } from './ExecutedCellsTreeDataProvider';

export function activateNotebookCellExecutionTracking(context: vscode.ExtensionContext) {
	registerCommands(context);

	const showToasts = () =>
		vscode.workspace.getConfiguration('jupyter-cell-tags').get<boolean>('showDebugExecutionMessages', false);

	context.subscriptions.push(
		vscode.workspace.onDidChangeNotebookDocument(e => {
			e.cellChanges.forEach(change => {
				if (change.executionSummary?.success !== undefined) {
					const cell = change.cell;

					if (showToasts()) {
						vscode.window.showInformationMessage(`Cell ${cell.index} finished!`);
					}

					const executionTime = new Date();
					const notebookUri = cell.notebook.uri;
					recordCellExecution(context, notebookUri, cell.index, executionTime);
				}
			});
		})
	);

	registerExecutedCellsView(context);
}
