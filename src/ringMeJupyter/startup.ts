import * as vscode from 'vscode';
import { sendEmail } from './emailNotifier';
import { registerStatusBarProvider } from './statusBarProvider';
import { registerToggleBellCommand } from './commands';

export function activateRingMeJupyter(context: vscode.ExtensionContext) {
    console.log('Ring-Me-Jupyter module activated!');

    //listens condition of cell
	const notebookChangeDisposable = vscode.workspace.onDidChangeNotebookDocument(e => {
		e.cellChanges.forEach(change => {
	  	if (change.executionSummary?.success !== undefined) {
			const cell = change.cell;
			if (cell.metadata?.notifyOnComplete) {	
				const outputText = cell.outputs?.map(output => {
					return output.items?.map(item => Buffer.from(item.data).toString('utf-8')).join('\n');//to string
				}).join('\n') || "No output available";

		  		vscode.window.showInformationMessage(`Cell ${cell.index} finished!`);
				console.log(`Cell ${cell.index} finished!`);
			  	sendEmail(cell.index, outputText); 
			}
	  	}
		});
  	});
	context.subscriptions.push(notebookChangeDisposable);

	registerStatusBarProvider(context);
	registerToggleBellCommand(context);
}
