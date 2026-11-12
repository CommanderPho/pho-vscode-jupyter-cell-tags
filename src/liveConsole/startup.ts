import * as vscode from 'vscode';
import { log } from '../util/logging';

export const LIVE_CONSOLE_OPEN_COMMAND = 'jupyter-cell-tags.liveConsole.open';

/**
 * Register the live TypeScript console (extension-host REPL).
 * Disposing the feature context closes the panel and unregisters the command.
 *
 * Panel/evaluator/`typescript` are required only here so a missing runtime
 * dependency cannot break extension load when Live Console is disabled.
 */
export function activateLiveConsole(context: vscode.ExtensionContext): void {
	const { LiveConsolePanel } = require('./liveConsolePanel') as typeof import('./liveConsolePanel');
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
