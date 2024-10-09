import * as vscode from 'vscode';
import { registerCommands } from './commands';

export function activateCellHeadings(context: vscode.ExtensionContext) {
	// Register all of our commands
	registerCommands(context);

}
