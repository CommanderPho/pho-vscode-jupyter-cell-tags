import * as vscode from 'vscode';
import { getExecutedCellsForCurrentSessionWithStatus, ExecutionStatus } from './cellExecutionTracking';
import { log } from '../util/logging';

export interface ExecutedCellItem {
	cellIndex: number;
	status: ExecutionStatus;
	executionOrder: number;
	executionTime: string;
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
		
		super(`Cell ${executedCell.cellIndex}: ${statusIcon} ${statusText}`, vscode.TreeItemCollapsibleState.None);
		
		this.tooltip = `Cell ${executedCell.cellIndex}\nStatus: ${statusText}\nExecuted: ${new Date(executedCell.executionTime).toLocaleString()}\nPreview: ${cellPreview}${cellPreview.length >= 50 ? '...' : ''}`;
		this.description = cellPreview;
		
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
			this.executedCells = getExecutedCellsForCurrentSessionWithStatus(this.context, notebookUri, notebook);
		} else if (this.currentNotebook) {
			this.executedCells = getExecutedCellsForCurrentSessionWithStatus(this.context, this.currentNotebook.uri, this.currentNotebook);
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

	// Listen to notebook changes
	context.subscriptions.push(
		vscode.window.onDidChangeActiveNotebookEditor(() => updateView())
	);

	// Listen to notebook document changes (cell execution, outputs, etc.)
	context.subscriptions.push(
		vscode.workspace.onDidChangeNotebookDocument((e) => {
			if (e.notebook === vscode.window.activeNotebookEditor?.notebook) {
				// Refresh after a short delay to allow execution to complete
				setTimeout(() => updateView(), 500);
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
