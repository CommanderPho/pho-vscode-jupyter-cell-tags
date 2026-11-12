import * as vscode from 'vscode';
import { getExecutedCellsForCurrentSessionWithStatus, ExecutionStatus } from './cellExecutionTracking';
import { log } from '../util/logging';
import { getMemoryBreakdownStore } from '../cellMemory/store';
import { formatMemoryDelta } from '../cellMemory/format';
import { isExecutedCellsDisplayEnabled } from '../cellMemory/statusBarProvider';
import { MemoryBreakdown } from '../cellMemory/types';

export interface ExecutedCellItem {
	cellIndex: number;
	status: ExecutionStatus;
	executionOrder: number;
	executionTime: string;
	memoryLabel?: string;
}

export class ExecutedCellTreeItem extends vscode.TreeItem {
	constructor(
		public readonly executedCell: ExecutedCellItem,
		public readonly notebook: vscode.NotebookDocument
	) {
		const cell = notebook.cellAt(executedCell.cellIndex);
		const cellPreview = cell ? cell.document.getText().substring(0, 50).replace(/\n/g, ' ') : '';
		const statusIcon = executedCell.status === 'error' ? '$(error)' : executedCell.status === 'success' ? '$(check)' : '$(question)';
		const statusText = executedCell.status === 'error' ? 'Error' : executedCell.status === 'success' ? 'Success' : 'Unknown';
		const memorySuffix = executedCell.memoryLabel ? ` ${executedCell.memoryLabel}` : '';

		super(`Cell ${executedCell.cellIndex}: ${statusIcon} ${statusText}${memorySuffix}`, vscode.TreeItemCollapsibleState.None);

		const memoryTooltip = executedCell.memoryLabel
			? `\nMemory (approx kernel RSS): ${executedCell.memoryLabel}`
			: '';
		this.tooltip = `Cell ${executedCell.cellIndex}\nStatus: ${statusText}\nExecuted: ${new Date(executedCell.executionTime).toLocaleString()}${memoryTooltip}\nPreview: ${cellPreview}${cellPreview.length >= 50 ? '...' : ''}`;
		this.description = executedCell.memoryLabel
			? `${executedCell.memoryLabel} · ${cellPreview}`
			: cellPreview;

		// Set icon based on status
		if (executedCell.status === 'error') {
			this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
		} else if (executedCell.status === 'success') {
			this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
		} else {
			this.iconPath = new vscode.ThemeIcon('question');
		}

		this.contextValue = 'executedCellItem';
		this.command = {
			command: 'jupyter-cell-tags.executedCells.selectCell',
			title: 'Select Cell',
			arguments: [executedCell.cellIndex]
		};
	}
}

/**
 * Match chronological memory samples to session execution records per cell URI.
 */
function attachMemoryLabels(
	notebook: vscode.NotebookDocument,
	executedCells: ExecutedCellItem[]
): ExecutedCellItem[] {
	if (!isExecutedCellsDisplayEnabled()) {
		return executedCells;
	}
	const store = getMemoryBreakdownStore();
	if (!store) {
		return executedCells;
	}

	const queues = new Map<string, MemoryBreakdown[]>();
	for (const sample of store.getAll()) {
		const list = queues.get(sample.cellUri) ?? [];
		list.push(sample);
		queues.set(sample.cellUri, list);
	}

	const chronological = [...executedCells].sort((a, b) => a.executionOrder - b.executionOrder);
	const labels = new Map<number, string>();

	for (const record of chronological) {
		const cell = notebook.cellAt(record.cellIndex);
		if (!cell) {
			continue;
		}
		const uri = cell.document.uri.toString();
		const queue = queues.get(uri);
		if (!queue || queue.length === 0) {
			continue;
		}
		const sample = queue.shift()!;
		const label = formatMemoryDelta(sample.deltaBytes, sample.peakBytes);
		if (label) {
			labels.set(record.executionOrder, label);
		}
	}

	return executedCells.map((item) => ({
		...item,
		memoryLabel: labels.get(item.executionOrder),
	}));
}

export class ExecutedCellsTreeDataProvider implements vscode.TreeDataProvider<ExecutedCellTreeItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<ExecutedCellTreeItem | undefined | null> = new vscode.EventEmitter<ExecutedCellTreeItem | undefined | null>();
	readonly onDidChangeTreeData: vscode.Event<ExecutedCellTreeItem | undefined | null> = this._onDidChangeTreeData.event;

	private context: vscode.ExtensionContext;
	private executedCells: ExecutedCellItem[] = [];
	private currentNotebook: vscode.NotebookDocument | undefined;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	refresh(notebook?: vscode.NotebookDocument): void {
		if (notebook) {
			this.currentNotebook = notebook;
			const notebookUri = notebook.uri;
			const raw = getExecutedCellsForCurrentSessionWithStatus(this.context, notebookUri, notebook);
			this.executedCells = attachMemoryLabels(notebook, raw);
		} else if (this.currentNotebook) {
			const raw = getExecutedCellsForCurrentSessionWithStatus(this.context, this.currentNotebook.uri, this.currentNotebook);
			this.executedCells = attachMemoryLabels(this.currentNotebook, raw);
		} else {
			this.executedCells = [];
		}
		this._onDidChangeTreeData.fire(null);
	}

	getTreeItem(element: ExecutedCellTreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: ExecutedCellTreeItem): Thenable<ExecutedCellTreeItem[]> {
		if (!this.currentNotebook) {
			return Promise.resolve([]);
		}

		if (element) {
			// Executed cell items have no children
			return Promise.resolve([]);
		} else {
			const items = this.executedCells.map(executedCell =>
				new ExecutedCellTreeItem(executedCell, this.currentNotebook!)
			);
			return Promise.resolve(items);
		}
	}
}

export function register(context: vscode.ExtensionContext) {
	const provider = new ExecutedCellsTreeDataProvider(context);

	const treeView = vscode.window.createTreeView<ExecutedCellTreeItem>('executed-cells-view', {
		treeDataProvider: provider,
		showCollapseAll: false
	});

	context.subscriptions.push(treeView);

	// Update view when active notebook changes
	const updateView = () => {
		const notebookEditor = vscode.window.activeNotebookEditor;
		if (notebookEditor) {
			provider.refresh(notebookEditor.notebook);
		} else {
			provider.refresh();
		}
	};

	let refreshTimer: ReturnType<typeof setTimeout> | undefined;
	const scheduleUpdateView = () => {
		if (refreshTimer) {
			clearTimeout(refreshTimer);
		}
		refreshTimer = setTimeout(() => {
			refreshTimer = undefined;
			updateView();
		}, 500);
	};

	// Listen to notebook changes
	context.subscriptions.push(
		vscode.window.onDidChangeActiveNotebookEditor(() => updateView()),
		{
			dispose: () => {
				if (refreshTimer) {
					clearTimeout(refreshTimer);
				}
			}
		}
	);

	// Listen to notebook document changes (cell execution, outputs, etc.)
	context.subscriptions.push(
		vscode.workspace.onDidChangeNotebookDocument((e) => {
			if (e.notebook !== vscode.window.activeNotebookEditor?.notebook) {
				return;
			}
			const executionChanged = e.cellChanges.some(c => c.executionSummary !== undefined);
			if (!executionChanged && e.contentChanges.length === 0) {
				return;
			}
			scheduleUpdateView();
		})
	);

	// Refresh when memory samples arrive or display setting changes
	const store = getMemoryBreakdownStore();
	if (store) {
		context.subscriptions.push(store.onDidChange(() => scheduleUpdateView()));
	}
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('jupyter-cell-tags.cellMemory.showInExecutedCells')) {
				scheduleUpdateView();
			}
		})
	);

	// Command to select a cell from the view
	context.subscriptions.push(
		vscode.commands.registerCommand('jupyter-cell-tags.executedCells.selectCell', async (cellIndex: number) => {
			const editor = vscode.window.activeNotebookEditor;
			if (editor && cellIndex >= 0 && cellIndex < editor.notebook.cellCount) {
				const range = new vscode.NotebookRange(cellIndex, cellIndex + 1);
				editor.selection = range;
				await editor.revealRange(range, vscode.NotebookEditorRevealType.AtTop);
				log(`Navigated to executed cell at index ${cellIndex}`);
			}
		})
	);

	// Initial update
	updateView();
}
