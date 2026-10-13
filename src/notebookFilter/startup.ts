import * as vscode from 'vscode';
import { log } from '../util/logging';
import { NotebookFilterManager } from './NotebookFilterManager';
import {
	NOTEBOOK_CELL_FILTER_VIEW_ID,
	NotebookFilterWebviewProvider
} from './filterWebviewProvider';

export function activateNotebookFilter(context: vscode.ExtensionContext): NotebookFilterManager {
	const manager = new NotebookFilterManager();
	const webviewProvider = new NotebookFilterWebviewProvider(manager);
	context.subscriptions.push({ dispose: () => manager.dispose() });

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(NOTEBOOK_CELL_FILTER_VIEW_ID, webviewProvider)
	);

	let reapplyTimer: ReturnType<typeof setTimeout> | undefined;
	let refreshTimer: ReturnType<typeof setTimeout> | undefined;

	const scheduleReapply = (notebook: vscode.NotebookDocument) => {
		if (!manager.isActive(notebook)) {
			return;
		}
		if (reapplyTimer) {
			clearTimeout(reapplyTimer);
		}
		reapplyTimer = setTimeout(() => {
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
			scheduleReapply(e.notebook);
			if (vscode.window.activeNotebookEditor?.notebook === e.notebook) {
				scheduleWebviewRefresh(e.notebook);
			}
		}),
		vscode.window.onDidChangeActiveNotebookEditor(async editor => {
			await manager.syncUi(editor?.notebook);
			webviewProvider.postState(editor?.notebook);
		}),
		vscode.workspace.onDidCloseNotebookDocument(notebook => {
			manager.forget(notebook);
			void manager.syncUi();
			webviewProvider.postState();
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
