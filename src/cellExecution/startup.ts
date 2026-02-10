// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import * as vscode from 'vscode';
import { registerCommands, recordCellExecution } from './cellExecutionTracking';
// import { registerDocuments } from './documents';
import { register as registerExecutedCellsView } from './ExecutedCellsTreeDataProvider';

export function activateNotebookCellExecutionTracking(context: vscode.ExtensionContext) {
	// Register all of our commands
	registerCommands(context);

    // Register document handling
    // registerDocuments(context);

    context.subscriptions.push(
        vscode.workspace.onDidChangeNotebookDocument(e => {
            e.cellChanges.forEach(change => {
                if (change.executionSummary?.success !== undefined) {
                    const cell = change.cell;
                    
                    vscode.window.showInformationMessage(`Cell ${cell.index} finished!`);
                    console.log(`Cell ${cell.index} finished!`);
                    
                    const executionTime = new Date();
                    const notebookUri = cell.notebook.uri;
                    recordCellExecution(context, notebookUri, cell.index, executionTime);
                }
            });
        })
    );

    // Register cell status bar
    registerExecutedCellsView(context);
    // registerCellStatusBarProvider(context);
}
