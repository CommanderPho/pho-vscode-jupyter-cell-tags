import * as vscode from 'vscode';
import { diffNotebookVsCommit, NotebookDiffErrorReason } from './gitDiffProvider';
import { highlightCell } from '../util/cellVisualHighlight';
import { log } from '../util/logging';

export type ModifiedCellStatus = 'modified' | 'added';

export interface ModifiedCellItem {
	cellIndex: number;
	status: ModifiedCellStatus;
}

type WelcomeReason = 'noNotebook' | 'notFile' | 'notGit' | 'gitError' | 'noChanges' | 'hasChanges';

export class GitModifiedCellTreeItem extends vscode.TreeItem {
	constructor(
		public readonly modifiedCell: ModifiedCellItem,
		public readonly notebook: vscode.NotebookDocument
	) {
		const cell = notebook.cellAt(modifiedCell.cellIndex);
		const cellPreview = cell
			? cell.document.getText().substring(0, 50).replace(/\n/g, ' ')
			: '';
		const statusLabel = modifiedCell.status === 'modified' ? 'Modified' : 'Added';

		super(
			`Cell ${modifiedCell.cellIndex}: ${statusLabel}`,
			vscode.TreeItemCollapsibleState.None
		);

		this.tooltip = `Cell ${modifiedCell.cellIndex}\nStatus: ${statusLabel} vs HEAD\nPreview: ${cellPreview}${cellPreview.length >= 50 ? '...' : ''}`;
		this.description = cellPreview;

		if (modifiedCell.status === 'modified') {
			this.iconPath = new vscode.ThemeIcon('diff-modified');
		} else {
			this.iconPath = new vscode.ThemeIcon('diff-added');
		}

		this.contextValue = 'gitModifiedCellItem';
		this.command = {
			command: 'jupyter-cell-tags.gitDiff.selectModifiedCell',
			title: 'Select Cell',
			arguments: [modifiedCell.cellIndex],
		};
	}
}

export class GitModifiedCellsTreeDataProvider
	implements vscode.TreeDataProvider<GitModifiedCellTreeItem>
{
	private _onDidChangeTreeData = new vscode.EventEmitter<
		GitModifiedCellTreeItem | undefined | null
	>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private items: ModifiedCellItem[] = [];
	private currentNotebook: vscode.NotebookDocument | undefined;
	private refreshGeneration = 0;
	private refreshDebounce: NodeJS.Timeout | undefined;

	getTreeItem(element: GitModifiedCellTreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: GitModifiedCellTreeItem): Thenable<GitModifiedCellTreeItem[]> {
		if (element || !this.currentNotebook) {
			return Promise.resolve([]);
		}

		const notebook = this.currentNotebook;
		const items = this.items
			.filter(item => item.cellIndex >= 0 && item.cellIndex < notebook.cellCount)
			.map(item => new GitModifiedCellTreeItem(item, notebook));
		return Promise.resolve(items);
	}

	/** Debounced refresh for document-change listeners. */
	scheduleRefresh(delayMs: number = 400): void {
		if (this.refreshDebounce) {
			clearTimeout(this.refreshDebounce);
		}
		this.refreshDebounce = setTimeout(() => {
			this.refreshDebounce = undefined;
			void this.refresh();
		}, delayMs);
	}

	async refresh(notebook?: vscode.NotebookDocument): Promise<void> {
		const generation = ++this.refreshGeneration;
		const target =
			notebook ??
			vscode.window.activeNotebookEditor?.notebook ??
			this.currentNotebook;

		if (!target) {
			this.currentNotebook = undefined;
			this.items = [];
			await this.setWelcomeReason('noNotebook');
			this._onDidChangeTreeData.fire(null);
			return;
		}

		this.currentNotebook = target;

		if (target.uri.scheme !== 'file') {
			this.items = [];
			await this.setWelcomeReason('notFile');
			this._onDidChangeTreeData.fire(null);
			return;
		}

		const outcome = await diffNotebookVsCommit(target, 'HEAD', 'HEAD');
		if (generation !== this.refreshGeneration) {
			return; // Stale refresh
		}

		if (!outcome.ok) {
			this.items = [];
			const reason = mapErrorToWelcome(outcome.reason);
			await this.setWelcomeReason(reason);
			log(`[GitModifiedCells] Diff failed: ${outcome.message}`);
			this._onDidChangeTreeData.fire(null);
			return;
		}

		const { diff } = outcome;
		const combined: ModifiedCellItem[] = [];
		for (const idx of Array.from(diff.modified).sort((a, b) => a - b)) {
			if (idx >= 0 && idx < target.cellCount) {
				combined.push({ cellIndex: idx, status: 'modified' });
			}
		}
		for (const idx of Array.from(diff.added).sort((a, b) => a - b)) {
			if (idx >= 0 && idx < target.cellCount) {
				combined.push({ cellIndex: idx, status: 'added' });
			}
		}
		combined.sort((a, b) => a.cellIndex - b.cellIndex);

		this.items = combined;
		await this.setWelcomeReason(combined.length > 0 ? 'hasChanges' : 'noChanges');
		this._onDidChangeTreeData.fire(null);
		log(`[GitModifiedCells] vs HEAD: ${diff.modified.size} modified, ${diff.added.size} added`);
	}

	dispose(): void {
		if (this.refreshDebounce) {
			clearTimeout(this.refreshDebounce);
		}
		this._onDidChangeTreeData.dispose();
	}

	private async setWelcomeReason(reason: WelcomeReason): Promise<void> {
		await vscode.commands.executeCommand(
			'setContext',
			'jupyter-cell-tags.gitModifiedCells.welcome',
			reason
		);
	}
}

function mapErrorToWelcome(reason: NotebookDiffErrorReason): WelcomeReason {
	switch (reason) {
		case 'noNotebook':
			return 'noNotebook';
		case 'notFile':
			return 'notFile';
		case 'notGit':
			return 'notGit';
		case 'gitError':
		default:
			return 'gitError';
	}
}

export function registerGitModifiedCellsView(context: vscode.ExtensionContext): void {
	const provider = new GitModifiedCellsTreeDataProvider();
	context.subscriptions.push({ dispose: () => provider.dispose() });

	const treeView = vscode.window.createTreeView<GitModifiedCellTreeItem>(
		'git-modified-cells-view',
		{
			treeDataProvider: provider,
			showCollapseAll: false,
		}
	);
	context.subscriptions.push(treeView);

	const updateView = () => {
		const notebookEditor = vscode.window.activeNotebookEditor;
		if (notebookEditor) {
			void provider.refresh(notebookEditor.notebook);
		} else {
			void provider.refresh();
		}
	};

	context.subscriptions.push(
		vscode.window.onDidChangeActiveNotebookEditor(() => updateView())
	);

	context.subscriptions.push(
		vscode.workspace.onDidChangeNotebookDocument(e => {
			if (e.notebook === vscode.window.activeNotebookEditor?.notebook) {
				provider.scheduleRefresh(400);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'jupyter-cell-tags.gitDiff.refreshModifiedCells',
			() => updateView()
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'jupyter-cell-tags.gitDiff.selectModifiedCell',
			async (cellIndex: number) => {
				const editor = vscode.window.activeNotebookEditor;
				if (!editor || cellIndex < 0 || cellIndex >= editor.notebook.cellCount) {
					return;
				}
				const range = new vscode.NotebookRange(cellIndex, cellIndex + 1);
				editor.selection = range;
				await editor.revealRange(range, vscode.NotebookEditorRevealType.AtTop);
				await highlightCell(cellIndex, {
					duration: 1500,
					showMessage: false,
					pulse: true,
					pulseCount: 1,
					notebookUri: editor.notebook.uri,
				});
				log(`[GitModifiedCells] Navigated to cell ${cellIndex}`);
			}
		)
	);

	updateView();
}
