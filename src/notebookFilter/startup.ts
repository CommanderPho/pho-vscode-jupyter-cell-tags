import * as vscode from 'vscode';
import { log } from '../util/logging';
import { NotebookFilterManager } from './NotebookFilterManager';
import {
	NOTEBOOK_CELL_FILTER_VIEW_ID,
	NotebookFilterWebviewProvider
} from './filterWebviewProvider';

let filterManager: NotebookFilterManager | undefined;

export function getFilterManager(): NotebookFilterManager | undefined {
	return filterManager;
}

export function activateNotebookFilter(context: vscode.ExtensionContext): NotebookFilterManager {
	const manager = new NotebookFilterManager();
	filterManager = manager;
	const webviewProvider = new NotebookFilterWebviewProvider(manager);
	context.subscriptions.push({
		dispose: async () => {
			try {
				await manager.dispose();
			} finally {
				if (filterManager === manager) {
					filterManager = undefined;
				}
			}
		}
	});

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(NOTEBOOK_CELL_FILTER_VIEW_ID, webviewProvider)
	);

	let reapplyTimer: ReturnType<typeof setTimeout> | undefined;
	let refreshTimer: ReturnType<typeof setTimeout> | undefined;

	const scheduleReapply = (notebook: vscode.NotebookDocument, e?: vscode.NotebookDocumentChangeEvent) => {
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
			await manager.clear(editor.notebook);
			vscode.window.setStatusBarMessage('Notebook cell filter cleared', 2000);
			webviewProvider.postState(editor.notebook);
		})
	);

	context.subscriptions.push(
		vscode.workspace.onDidChangeNotebookDocument(e => {
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
				await manager.clear(notebook);
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
