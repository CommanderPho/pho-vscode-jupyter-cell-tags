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
				try {
					let outputText = "No output available";
					if (cell.outputs && cell.outputs.length > 0) {
						try {
							outputText = cell.outputs.map(output => {
								if (!output.items || output.items.length === 0) {
									return '';
								}
								return output.items.map(item => {
									try {
										return Buffer.from(item.data).toString('utf-8');
									} catch (bufferError) {
										console.error(`Failed to convert output item to string for cell ${cell.index}:`, bufferError);
										return '[Error: Unable to decode output]';
									}
								}).join('\n');
							}).join('\n') || "No output available";
						} catch (outputError) {
							console.error(`Failed to process output for cell ${cell.index}:`, outputError);
							outputText = '[Error: Unable to process cell output]';
						}
					}

					vscode.window.showInformationMessage(`Cell ${cell.index} finished!`);
					console.log(`Cell ${cell.index} finished!`);
					sendEmail(cell.index, outputText).catch(emailError => {
						console.error(`Failed to send email notification for cell ${cell.index}:`, emailError);
						vscode.window.showErrorMessage(`Failed to send email notification for cell ${cell.index}`);
					});
				} catch (error) {
					console.error(`Error processing notification for cell ${cell.index}:`, error);
					vscode.window.showErrorMessage(`Error processing notification for cell ${cell.index}`);
				}
			}
	  	}
		});
  	});
	context.subscriptions.push(notebookChangeDisposable);

	registerStatusBarProvider(context);
	registerToggleBellCommand(context);
}
