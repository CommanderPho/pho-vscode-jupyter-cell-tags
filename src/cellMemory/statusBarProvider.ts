import * as vscode from 'vscode';
import { formatMemoryDelta, formatMemoryDeltaCompact } from './format';
import { MemoryBreakdownStore } from './store';

export class CellMemoryStatusBarProvider implements vscode.NotebookCellStatusBarItemProvider {
	private readonly _onDidChange = new vscode.EventEmitter<void>();
	readonly onDidChangeCellStatusBarItems = this._onDidChange.event;
	private enabled = false;

	constructor(private readonly store: MemoryBreakdownStore) {
		this.enabled = isStatusBarDisplayEnabled();
	}

	refreshSetting(): void {
		this.enabled = isStatusBarDisplayEnabled();
		this._onDidChange.fire();
	}

	notifyStoreChanged(): void {
		if (this.enabled) {
			this._onDidChange.fire();
		}
	}

	provideCellStatusBarItems(
		cell: vscode.NotebookCell,
		_token: vscode.CancellationToken
	): vscode.ProviderResult<vscode.NotebookCellStatusBarItem[]> {
		if (!this.enabled || cell.kind !== vscode.NotebookCellKind.Code) {
			return [];
		}

		const latest = this.store.getLatestForCell(cell.document.uri.toString());
		if (!latest || latest.deltaBytes === undefined) {
			return [];
		}

		const compact = formatMemoryDeltaCompact(latest.deltaBytes);
		if (!compact) {
			return [];
		}

		const full = formatMemoryDelta(latest.deltaBytes, latest.peakBytes);
		const item = new vscode.NotebookCellStatusBarItem(
			compact,
			vscode.NotebookCellStatusBarAlignment.Right
		);
		item.tooltip = `Kernel RSS (approx): ${full}${latest.beforeSkipped ? ' (before sample skipped)' : ''}`;
		return [item];
	}

	dispose(): void {
		this._onDidChange.dispose();
	}
}

export function isStatusBarDisplayEnabled(): boolean {
	return (
		vscode.workspace
			.getConfiguration('jupyter-cell-tags')
			.get<boolean>('cellMemory.showInStatusBar', false) === true
	);
}

export function isExecutedCellsDisplayEnabled(): boolean {
	return (
		vscode.workspace
			.getConfiguration('jupyter-cell-tags')
			.get<boolean>('cellMemory.showInExecutedCells', true) !== false
	);
}

export function registerStatusBarProvider(
	context: vscode.ExtensionContext,
	store: MemoryBreakdownStore
): CellMemoryStatusBarProvider {
	const provider = new CellMemoryStatusBarProvider(store);
	context.subscriptions.push(
		vscode.notebooks.registerNotebookCellStatusBarItemProvider('jupyter-notebook', provider),
		provider
	);
	context.subscriptions.push(
		store.onDidChange(() => provider.notifyStoreChanged()),
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('jupyter-cell-tags.cellMemory.showInStatusBar')) {
				provider.refreshSetting();
			}
		})
	);
	return provider;
}
