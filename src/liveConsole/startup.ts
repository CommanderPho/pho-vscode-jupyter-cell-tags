import * as vscode from 'vscode';
import { log } from '../util/logging';
import { LiveConsolePanel } from './liveConsolePanel';

export const LIVE_CONSOLE_OPEN_COMMAND = 'jupyter-cell-tags.liveConsole.open';

/**
 * Register the live TypeScript console (extension-host REPL).
 * Disposing the feature context closes the panel and unregisters the command.
 */
export function activateLiveConsole(context: vscode.ExtensionContext): void {
	const panel = new LiveConsolePanel();
	context.subscriptions.push(panel);
	context.subscriptions.push(
		vscode.commands.registerCommand(LIVE_CONSOLE_OPEN_COMMAND, () => {
			log('Opening live TypeScript console');
			panel.open();
		})
	);
	log('Live TypeScript console feature activated');
}
