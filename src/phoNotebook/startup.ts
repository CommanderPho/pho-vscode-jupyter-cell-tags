import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { Controller } from './controller';
import { PhoNotebookCustomSerializer } from './serializer'

export function activatePhoNotebookFeatures(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.workspace.registerNotebookSerializer('pho-notebook', new PhoNotebookCustomSerializer())
	);
	

  context.subscriptions.push(new Controller());

	// Register all of our commands
	registerCommands(context);

}
