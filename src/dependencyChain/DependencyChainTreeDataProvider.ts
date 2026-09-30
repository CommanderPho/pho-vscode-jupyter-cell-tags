import * as vscode from 'vscode';
import { ChainTreeNode } from './buildChain';
import { ChainHistory, ChainSnapshot, firstLinePreview } from './chainHistory';

type DepTreeItem = ChainHeaderItem | ChainCellItem;

export class ChainHeaderItem extends vscode.TreeItem {
	constructor(
		public readonly snapshot: ChainSnapshot,
		isActive: boolean
	) {
		const preview = snapshot.preview ? `: ${snapshot.preview}` : '';
		const active = isActive ? ' (active)' : '';
		super(
			`Cell ${snapshot.targetIndex}${preview}${active}`,
			isActive
				? vscode.TreeItemCollapsibleState.Expanded
				: vscode.TreeItemCollapsibleState.Collapsed
		);
		this.id = snapshot.id;
		this.description = `${formatTime(snapshot.createdAt)} · ${snapshot.chain.hops.length} cells`;
		this.iconPath = new vscode.ThemeIcon(isActive ? 'target' : 'history');
		this.contextValue = 'dependencyChainHeader';
		this.tooltip = headerTooltip(snapshot);
		this.command = {
			command: 'jupyter-cell-tags.dependencyChain.selectChain',
			title: 'Show Dependency Chain',
			arguments: [snapshot.notebookUri, snapshot.id],
		};
	}
}

export class ChainCellItem extends vscode.TreeItem {
	constructor(
		public readonly snapshot: ChainSnapshot,
		public readonly node: ChainTreeNode,
		preview: string
	) {
		const names = node.hop > 0 && node.names.length ? `  ${node.names.join(', ')}` : '';
		const hop = node.hop > 0 ? `  [${node.hop}]` : '';
		super(
			`Cell ${node.cellIndex}${hop}${names}`,
			node.children.length > 0
				? node.hop === 0
					? vscode.TreeItemCollapsibleState.Expanded
					: vscode.TreeItemCollapsibleState.Collapsed
				: vscode.TreeItemCollapsibleState.None
		);
		this.id = `${snapshot.id}:${node.cellIndex}`;
		this.description = cellDescription(node, preview);
		this.tooltip = cellTooltip(snapshot, node, preview);
		this.iconPath = new vscode.ThemeIcon(node.hop === 0 ? 'target' : 'symbol-variable');
		this.contextValue = 'dependencyChainCell';
		this.command = {
			command: 'jupyter-cell-tags.dependencyChain.revealCell',
			title: 'Reveal Cell',
			arguments: [snapshot.notebookUri, snapshot.id, node.cellIndex],
		};
	}
}

export class DependencyChainTreeDataProvider implements vscode.TreeDataProvider<DepTreeItem> {
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<DepTreeItem | undefined | null>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(private readonly history: ChainHistory) {}

	refresh(): void {
		this._onDidChangeTreeData.fire(undefined);
	}

	getTreeItem(element: DepTreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: DepTreeItem): Thenable<DepTreeItem[]> {
		const notebookUri = vscode.window.activeNotebookEditor?.notebook.uri.toString();
		if (!notebookUri) {
			return Promise.resolve([]);
		}
		if (!element) {
			const activeId = this.history.getActiveId(notebookUri);
			return Promise.resolve(
				this.history.list(notebookUri).map(
					(snapshot) => new ChainHeaderItem(snapshot, snapshot.id === activeId)
				)
			);
		}
		if (element instanceof ChainHeaderItem) {
			return Promise.resolve([
				this.makeCellItem(element.snapshot, element.snapshot.chain.tree),
			]);
		}
		return Promise.resolve(
			element.node.children.map((child) => this.makeCellItem(element.snapshot, child))
		);
	}

	private makeCellItem(snapshot: ChainSnapshot, node: ChainTreeNode): ChainCellItem {
		return new ChainCellItem(snapshot, node, livePreview(snapshot.notebookUri, node.cellIndex));
	}
}

function livePreview(notebookUri: string, cellIndex: number): string {
	const notebook = vscode.workspace.notebookDocuments.find(
		(document) => document.uri.toString() === notebookUri
	);
	if (!notebook || cellIndex < 0 || cellIndex >= notebook.cellCount) {
		return '';
	}
	return firstLinePreview(notebook.cellAt(cellIndex).document.getText());
}

function cellDescription(node: ChainTreeNode, preview: string): string {
	const flags: string[] = [];
	if (node.unresolved.length > 0 && node.hop === 0) {
		flags.push(`unresolved: ${node.unresolved.join(', ')}`);
	}
	if (node.starImport) {
		flags.push('import *');
	}
	if (node.parseError) {
		flags.push('could not parse');
	}
	if (node.dynamicExec) {
		flags.push('exec/eval');
	}
	if (flags.length > 0) {
		return flags.join(' · ');
	}
	return preview;
}

function cellTooltip(snapshot: ChainSnapshot, node: ChainTreeNode, preview: string): string {
	const lines = [`Cell ${node.cellIndex}`];
	if (node.hop > 0) {
		lines.push(`Hop ${node.hop}`);
	} else {
		lines.push('Target cell');
	}
	if (node.names.length > 0) {
		lines.push(`Defines for parent: ${node.names.join(', ')}`);
	}
	if (preview) {
		lines.push(preview);
	}
	if (node.unresolved.length > 0) {
		lines.push(`Unresolved: ${node.unresolved.join(', ')}`);
	}
	if (node.hop === 0) {
		appendChainNotes(lines, snapshot);
	}
	return lines.join('\n');
}

function headerTooltip(snapshot: ChainSnapshot): string {
	const lines = [
		`Cell ${snapshot.targetIndex}`,
		snapshot.preview,
		`${snapshot.chain.hops.length} prerequisite cell(s)`,
		new Date(snapshot.createdAt).toLocaleString(),
	];
	if (snapshot.chain.unresolved.length > 0) {
		lines.push(`Unresolved: ${snapshot.chain.unresolved.join(', ')}`);
	}
	appendChainNotes(lines, snapshot);
	return lines.filter((line) => line.length > 0).join('\n');
}

function appendChainNotes(lines: string[], snapshot: ChainSnapshot): void {
	if (snapshot.chain.starImportCells.length > 0) {
		lines.push(`import * in cell(s): ${snapshot.chain.starImportCells.join(', ')}`);
	}
	if (snapshot.chain.parseErrorCells.length > 0) {
		lines.push(`Could not parse cell(s): ${snapshot.chain.parseErrorCells.join(', ')}`);
	}
}

function formatTime(timestamp: number): string {
	return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
