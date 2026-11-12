import * as vscode from 'vscode';
import { MemoryBreakdownStore, setMemoryBreakdownStore } from './store';
import { CellMemoryTracker } from './tracker';
import { registerStatusBarProvider } from './statusBarProvider';

/**
 * Activate cell memory breakdown: kernel RSS sampling + status bar + shared store for Executed Cells.
 */
export function activateCellMemoryBreakdown(context: vscode.ExtensionContext): void {
	const output = vscode.window.createOutputChannel('Jupyter Cell Memory');
	output.appendLine('[INFO] Cell Memory Breakdown activated.');
	context.subscriptions.push(output);

	const store = new MemoryBreakdownStore();
	setMemoryBreakdownStore(store);
	context.subscriptions.push({
		dispose: () => {
			setMemoryBreakdownStore(undefined);
			store.dispose();
		},
	});

	const tracker = new CellMemoryTracker(store, output);
	tracker.activate(context);

	registerStatusBarProvider(context, store);

	output.appendLine(
		'[INFO] Sampling kernel RSS on cell execution. Values are approximate (stdlib resource /proc).'
	);
}
