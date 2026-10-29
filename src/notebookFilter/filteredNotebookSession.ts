import * as vscode from 'vscode';
import { log } from '../util/logging';
import { getTagsFromNotebook } from '../util/notebookSelection';
import {
	isFilterActive,
	NotebookFilterCriteria
} from './filterCriteria';
import { snapshotToNbformatBytes } from './filteredCellSnapshot';
import {
	collectMatchingSnapshots,
	snapshotToCellData,
	snapshotToNotebookData
} from './filteredNotebookCells';
import {
	FilteredBarToExtensionMessage,
	getFilteredNotebookBarHtml
} from './filteredNotebookBar';
import { FilteredNotebookFileSystemProvider } from './filteredNotebookFs';
import {
	FILTERED_NOTEBOOK_SCHEME,
	filteredNotebookUri,
	isFilteredNotebook,
	isFilteredNotebookUri
} from './filteredNotebookScheme';

type Session = {
	id: string;
	sourceUri: vscode.Uri;
	filteredUri: vscode.Uri;
	criteria: NotebookFilterCriteria;
	matchCount: number;
	totalCount: number;
	sourceClosed: boolean;
	panel?: vscode.WebviewPanel;
	closing: boolean;
	strippingOutputs: boolean;
};

let sessionSeq = 0;

function sourceFileLabel(uri: vscode.Uri): string {
	const name = uri.path.split('/').pop() || uri.fsPath.split(/[/\\]/).pop();
	return name || 'notebook';
}

function filteredFileName(source: vscode.NotebookDocument): string {
	const base = sourceFileLabel(source.uri).replace(/\.ipynb$/i, '');
	return `${base}-filtered.ipynb`;
}

export function parseOpenTabArg(arg: unknown): NotebookFilterCriteria | undefined {
	if (typeof arg === 'string' && arg.length > 0) {
		return { tags: [arg] };
	}
	if (!arg || typeof arg !== 'object') {
		return undefined;
	}
	const rec = arg as Record<string, unknown>;
	if (typeof rec.tagName === 'string' && rec.tagName.length > 0) {
		return { tags: [rec.tagName] };
	}
	if (typeof rec.label === 'string' && rec.tagName === undefined && !('tags' in rec) && !('cellKind' in rec)) {
		return { tags: [rec.label] };
	}
	const criteria: NotebookFilterCriteria = {};
	if (Array.isArray(rec.tags) && rec.tags.every(t => typeof t === 'string')) {
		criteria.tags = rec.tags as string[];
	}
	if (rec.cellKind === 'code' || rec.cellKind === 'markup') {
		criteria.cellKind = rec.cellKind;
	}
	if (typeof rec.hasOutputs === 'boolean') {
		criteria.hasOutputs = rec.hasOutputs;
	}
	if (typeof rec.executed === 'boolean') {
		criteria.executed = rec.executed;
	}
	if (
		(criteria.tags && criteria.tags.length > 0) ||
		criteria.cellKind !== undefined ||
		criteria.hasOutputs !== undefined ||
		criteria.executed !== undefined
	) {
		return criteria;
	}
	return undefined;
}

export class FilteredNotebookSessionManager implements vscode.Disposable {
	private readonly sessionsBySource = new Map<string, Session>();
	private readonly sessionsByFiltered = new Map<string, Session>();
	private readonly fs = new FilteredNotebookFileSystemProvider();
	private readonly fsRegistration: vscode.Disposable;
	private readonly closeListener: vscode.Disposable;
	private disposed = false;

	constructor() {
		this.fsRegistration = vscode.workspace.registerFileSystemProvider(
			FILTERED_NOTEBOOK_SCHEME,
			this.fs,
			{
				isCaseSensitive: true,
				isReadonly: new vscode.MarkdownString('Filtered notebook is a read-only snapshot of matching cells.')
			}
		);
		this.closeListener = vscode.workspace.onDidCloseNotebookDocument(notebook => {
			this.onNotebookClosed(notebook);
		});
	}

	dispose(): void {
		this.disposed = true;
		const sessions = [...this.sessionsBySource.values()];
		for (const session of sessions) {
			void this.closeSession(session);
		}
		this.closeListener.dispose();
		this.fsRegistration.dispose();
	}

	getByFilteredUri(uri: vscode.Uri): Session | undefined {
		return this.sessionsByFiltered.get(uri.toString());
	}

	getBySourceUri(uri: vscode.Uri): Session | undefined {
		return this.sessionsBySource.get(uri.toString());
	}

	getSourceNotebook(filteredUri: vscode.Uri): vscode.NotebookDocument | undefined {
		const session = this.getByFilteredUri(filteredUri);
		if (!session || session.sourceClosed) {
			return undefined;
		}
		return vscode.workspace.notebookDocuments.find(
			n => n.uri.toString() === session.sourceUri.toString()
		);
	}

	resolveSourceNotebook(): vscode.NotebookDocument | undefined {
		const active = vscode.window.activeNotebookEditor?.notebook;
		if (active && isFilteredNotebook(active)) {
			return this.getSourceNotebook(active.uri);
		}
		if (active && active.notebookType === 'jupyter-notebook' && !isFilteredNotebook(active)) {
			return active;
		}
		for (const editor of vscode.window.visibleNotebookEditors) {
			if (isFilteredNotebook(editor.notebook)) {
				const source = this.getSourceNotebook(editor.notebook.uri);
				if (source) {
					return source;
				}
			}
		}
		for (const editor of vscode.window.visibleNotebookEditors) {
			if (editor.notebook.notebookType === 'jupyter-notebook' && !isFilteredNotebook(editor.notebook)) {
				return editor.notebook;
			}
		}
		return undefined;
	}

	async open(
		source: vscode.NotebookDocument,
		criteria: NotebookFilterCriteria
	): Promise<vscode.NotebookDocument | undefined> {
		if (this.disposed) {
			return undefined;
		}
		if (isFilteredNotebook(source)) {
			const resolved = this.getSourceNotebook(source.uri);
			if (!resolved) {
				vscode.window.showWarningMessage('Open a Jupyter notebook to show filtered cells in a new tab.');
				return undefined;
			}
			source = resolved;
		}

		const existing = this.sessionsBySource.get(source.uri.toString());
		if (existing) {
			if (isFilterActive(criteria)) {
				await this.applyCriteria(existing.filteredUri, criteria);
			} else {
				this.postBarState(existing);
			}
			await this.reveal(existing);
			return vscode.workspace.notebookDocuments.find(
				n => n.uri.toString() === existing.filteredUri.toString()
			);
		}

		const id = `${Date.now().toString(36)}-${sessionSeq++}`;
		const filteredUri = filteredNotebookUri(id, filteredFileName(source));
		const collected = collectMatchingSnapshots(source, criteria);
		this.fs.setFile(filteredUri, snapshotToNbformatBytes(collected.snapshot));

		const session: Session = {
			id,
			sourceUri: source.uri,
			filteredUri,
			criteria,
			matchCount: collected.matchCount,
			totalCount: collected.totalCount,
			sourceClosed: false,
			closing: false,
			strippingOutputs: false
		};
		this.sessionsBySource.set(source.uri.toString(), session);
		this.sessionsByFiltered.set(filteredUri.toString(), session);

		let document: vscode.NotebookDocument;
		try {
			document = await vscode.workspace.openNotebookDocument(filteredUri);
		} catch (err) {
			log(`pho-filtered open failed, falling back to untitled: ${err}`);
			document = await vscode.workspace.openNotebookDocument(
				'jupyter-notebook',
				snapshotToNotebookData(collected.snapshot)
			);
			this.sessionsByFiltered.delete(filteredUri.toString());
			session.filteredUri = document.uri;
			this.sessionsByFiltered.set(document.uri.toString(), session);
		}

		await vscode.window.showNotebookDocument(document, {
			preview: false,
			viewColumn: vscode.ViewColumn.Beside
		});

		try {
			await vscode.commands.executeCommand('workbench.action.newEditorGroupAbove');
		} catch (err) {
			log(`newEditorGroupAbove failed: ${err}`);
		}

		const panel = vscode.window.createWebviewPanel(
			'jupyter-cell-tags.filteredNotebookBar',
			`Filter: ${sourceFileLabel(source.uri)}`,
			{ viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
			{ enableScripts: true, retainContextWhenHidden: true }
		);
		session.panel = panel;
		panel.webview.html = getFilteredNotebookBarHtml(panel.webview);
		panel.webview.onDidReceiveMessage(async (message: FilteredBarToExtensionMessage) => {
			if (message.type === 'apply') {
				if (!isFilterActive(message.criteria)) {
					vscode.window.showInformationMessage('No filter criteria selected.');
					return;
				}
				await this.applyCriteria(session.filteredUri, message.criteria);
				return;
			}
			if (message.type === 'clear') {
				await this.applyCriteria(session.filteredUri, {});
			}
		});
		panel.onDidDispose(() => {
			if (session.closing) {
				return;
			}
			void this.closeSession(session);
		});
		this.postBarState(session);
		log(
			`Filtered notebook tab opened (${collected.matchCount}/${collected.totalCount}) from ${source.uri.toString()}`
		);
		return document;
	}

	async applyCriteria(filteredUri: vscode.Uri, criteria: NotebookFilterCriteria): Promise<void> {
		const session = this.getByFilteredUri(filteredUri);
		if (!session) {
			return;
		}
		if (session.sourceClosed) {
			this.postBarState(session);
			vscode.window.showWarningMessage('Source notebook is closed; cannot refresh filtered cells.');
			return;
		}
		const source = vscode.workspace.notebookDocuments.find(
			n => n.uri.toString() === session.sourceUri.toString()
		);
		if (!source) {
			session.sourceClosed = true;
			this.postBarState(session);
			return;
		}

		const collected = collectMatchingSnapshots(source, criteria);
		session.criteria = criteria;
		session.matchCount = collected.matchCount;
		session.totalCount = collected.totalCount;
		this.fs.setFile(session.filteredUri, snapshotToNbformatBytes(collected.snapshot));

		const filtered = vscode.workspace.notebookDocuments.find(
			n => n.uri.toString() === session.filteredUri.toString()
		);
		if (filtered) {
			const replaced = await this.replaceFilteredCells(filtered, collected.snapshot.cells.length
				? snapshotToCellData(collected.snapshot)
				: []);
			if (!replaced) {
				await this.reloadFiltered(filtered);
			}
		}
		this.postBarState(session);
	}

	async stripOutputsIfPresent(notebook: vscode.NotebookDocument): Promise<void> {
		const session = this.getByFilteredUri(notebook.uri);
		if (!session || session.strippingOutputs || session.closing) {
			return;
		}
		const dirty = notebook.getCells().filter(cell => cell.outputs.length > 0);
		if (dirty.length === 0) {
			return;
		}
		session.strippingOutputs = true;
		try {
			await this.applyCriteria(session.filteredUri, session.criteria);
		} finally {
			session.strippingOutputs = false;
		}
	}

	postBarState(session: Session): void {
		if (!session.panel) {
			return;
		}
		const source = vscode.workspace.notebookDocuments.find(
			n => n.uri.toString() === session.sourceUri.toString()
		);
		const tags = source ? getTagsFromNotebook(source) : [];
		const filterActive = isFilterActive(session.criteria);
		void session.panel.webview.postMessage({
			type: 'state',
			tags,
			criteria: session.criteria,
			matchCount: session.matchCount,
			totalCount: session.totalCount,
			filterActive,
			sourceClosed: session.sourceClosed,
			sourceName: sourceFileLabel(session.sourceUri),
			warning: session.sourceClosed
				? 'Source notebook is closed. Refresh is unavailable.'
				: undefined
		});
	}

	private async replaceFilteredCells(
		filtered: vscode.NotebookDocument,
		cells: vscode.NotebookCellData[]
	): Promise<boolean> {
		const edit = new vscode.WorkspaceEdit();
		edit.set(filtered.uri, [
			vscode.NotebookEdit.replaceCells(new vscode.NotebookRange(0, filtered.cellCount), cells)
		]);
		try {
			return await vscode.workspace.applyEdit(edit);
		} catch (err) {
			log(`Filtered notebook replaceCells failed: ${err}`);
			return false;
		}
	}

	private async reloadFiltered(filtered: vscode.NotebookDocument): Promise<void> {
		try {
			await vscode.window.showNotebookDocument(filtered, { preview: false, preserveFocus: true });
			await vscode.commands.executeCommand('workbench.action.files.revert');
		} catch (err) {
			log(`Filtered notebook revert failed: ${err}`);
		}
	}

	private async reveal(session: Session): Promise<void> {
		const filtered = vscode.workspace.notebookDocuments.find(
			n => n.uri.toString() === session.filteredUri.toString()
		);
		if (filtered) {
			try {
				await vscode.window.showNotebookDocument(filtered, { preview: false, preserveFocus: true });
			} catch (err) {
				log(`Failed to reveal filtered notebook: ${err}`);
			}
		}
		session.panel?.reveal(session.panel.viewColumn, false);
		this.postBarState(session);
	}

	private onNotebookClosed(notebook: vscode.NotebookDocument): void {
		if (isFilteredNotebookUri(notebook.uri) || this.getByFilteredUri(notebook.uri)) {
			const session = this.getByFilteredUri(notebook.uri);
			if (session && !session.closing) {
				void this.closeSession(session);
			}
			return;
		}
		const session = this.sessionsBySource.get(notebook.uri.toString());
		if (session) {
			session.sourceClosed = true;
			this.postBarState(session);
		}
	}

	private async closeSession(session: Session): Promise<void> {
		if (session.closing) {
			return;
		}
		session.closing = true;
		this.sessionsBySource.delete(session.sourceUri.toString());
		this.sessionsByFiltered.delete(session.filteredUri.toString());
		try {
			session.panel?.dispose();
		} catch {
			// already disposed
		}
		session.panel = undefined;
		this.fs.removeFile(session.filteredUri);
		await closeEditorsForUri(session.filteredUri);
	}
}

async function closeEditorsForUri(uri: vscode.Uri): Promise<void> {
	const target = uri.toString();
	for (const group of vscode.window.tabGroups.all) {
		for (const tab of group.tabs) {
			const input = tab.input as { uri?: vscode.Uri } | undefined;
			if (input?.uri?.toString() === target) {
				try {
					await vscode.window.tabGroups.close(tab, true);
				} catch (err) {
					log(`Failed to close filtered notebook tab: ${err}`);
				}
			}
		}
	}
}

