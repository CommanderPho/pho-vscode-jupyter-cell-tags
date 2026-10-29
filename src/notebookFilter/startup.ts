import * as vscode from 'vscode';
import { log } from '../util/logging';
import { NotebookFilterManager } from './NotebookFilterManager';
import {
	NOTEBOOK_CELL_FILTER_VIEW_ID,
	NotebookFilterWebviewProvider
} from './filterWebviewProvider';
import { isFilteredNotebook } from './filteredNotebookScheme';
import {
	FilteredNotebookSessionManager,
	parseOpenTabArg
} from './filteredNotebookSession';

let filterManager: NotebookFilterManager | undefined;
let filteredSessionManager: FilteredNotebookSessionManager | undefined;

export function getFilterManager(): NotebookFilterManager | undefined {
	return filterManager;
}

export function getFilteredSessionManager(): FilteredNotebookSessionManager | undefined {
	return filteredSessionManager;
}

export function activateNotebookFilter(context: vscode.ExtensionContext): NotebookFilterManager {
	const manager = new NotebookFilterManager();
	filterManager = manager;
	const sessions = new FilteredNotebookSessionManager();
	filteredSessionManager = sessions;
	const webviewProvider = new NotebookFilterWebviewProvider(manager, sessions);
	context.subscriptions.push(
		sessions,
		{
			dispose: async () => {
				try {
					await manager.dispose();
				} finally {
					if (filterManager === manager) {
						filterManager = undefined;
					}
					if (filteredSessionManager === sessions) {
						filteredSessionManager = undefined;
					}
				}
			}
		}
	);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(NOTEBOOK_CELL_FILTER_VIEW_ID, webviewProvider)
	);

	let reapplyTimer: ReturnType<typeof setTimeout> | undefined;
	let refreshTimer: ReturnType<typeof setTimeout> | undefined;

	const scheduleReapply = (notebook: vscode.NotebookDocument, e?: vscode.NotebookDocumentChangeEvent) => {
		if (isFilteredNotebook(notebook)) {
			return;
		}
		if (!manager.isActive(notebook)) {
			return;
		}
		if (manager.isApplying()) {
			return;
		}
		if (manager.isSettling()) {
			return;
		}
		if (e && !notebookChangeMayAffectFilter(e)) {
			return;
		}
		if (reapplyTimer) {
			clearTimeout(reapplyTimer);
		}
		reapplyTimer = setTimeout(() => {
			if (manager.isApplying() || manager.isSettling()) {
				return;
			}
			void manager.reapply(notebook).then(() => {
				webviewProvider.postState(notebook);
			});
		}, 150);
	};

	const scheduleWebviewRefresh = (notebook?: vscode.NotebookDocument) => {
		if (refreshTimer) {
			clearTimeout(refreshTimer);
		}
		refreshTimer = setTimeout(() => {
			webviewProvider.postState(notebook);
		}, 150);
	};

	context.subscriptions.push(
		vscode.commands.registerCommand('jupyter-cell-tags.notebookFilter.set', async () => {
			const editor = vscode.window.activeNotebookEditor;
			if (!editor) {
				vscode.window.showWarningMessage('Open a Jupyter notebook to filter cells.');
				return;
			}
			await vscode.commands.executeCommand(`${NOTEBOOK_CELL_FILTER_VIEW_ID}.focus`);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('jupyter-cell-tags.notebookFilter.clear', async () => {
			const editor = vscode.window.activeNotebookEditor;
			if (!editor) {
				vscode.window.showWarningMessage('Open a Jupyter notebook to clear the cell filter.');
				return;
			}
			if (isFilteredNotebook(editor.notebook)) {
				await sessions.applyCriteria(editor.notebook.uri, {});
				webviewProvider.postState(editor.notebook);
				return;
			}
			await manager.clear(editor.notebook);
			vscode.window.setStatusBarMessage('Notebook cell filter cleared', 2000);
			webviewProvider.postState(editor.notebook);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('jupyter-cell-tags.notebookFilter.openTab', async (arg?: unknown) => {
			const source = sessions.resolveSourceNotebook();
			if (!source) {
				vscode.window.showWarningMessage('Open a Jupyter notebook to show filtered cells in a new tab.');
				return;
			}
			const seeded = parseOpenTabArg(arg) ?? manager.getCriteria(source) ?? {};
			await sessions.open(source, seeded);
		})
	);

	context.subscriptions.push(
		vscode.workspace.onDidChangeNotebookDocument(e => {
			if (isFilteredNotebook(e.notebook)) {
				void sessions.stripOutputsIfPresent(e.notebook);
				return;
			}
			scheduleReapply(e.notebook, e);
			if (vscode.window.activeNotebookEditor?.notebook === e.notebook) {
				scheduleWebviewRefresh(e.notebook);
			}
		}),
		vscode.window.onDidChangeActiveNotebookEditor(async editor => {
			await manager.syncUi(editor?.notebook);
			webviewProvider.postState(editor?.notebook);
		}),
		vscode.workspace.onDidCloseNotebookDocument(notebook => {
			void (async () => {
				if (!isFilteredNotebook(notebook)) {
					await manager.clear(notebook);
				}
				webviewProvider.postState();
			})();
		}),
		{
			dispose: () => {
				if (reapplyTimer) {
					clearTimeout(reapplyTimer);
				}
				if (refreshTimer) {
					clearTimeout(refreshTimer);
				}
			}
		}
	);

	void manager.syncUi();
	log('Notebook filter module activated.');
	return manager;
}

/**
 * Changes that can alter filter matches. Collapse self-churn is absorbed by
 * NotebookFilterManager settle/applying gates rather than ignoring all metadata.
 */
function notebookChangeMayAffectFilter(e: vscode.NotebookDocumentChangeEvent): boolean {
	if (e.contentChanges.length > 0) {
		return true;
	}
	return e.cellChanges.length > 0;
}
