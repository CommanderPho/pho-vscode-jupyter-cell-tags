import * as vscode from 'vscode';
import { log } from '../util/logging';
import { NotebookFilterManager } from './NotebookFilterManager';
import { promptForFilterCriteria } from './filterQuickPick';

export function activateNotebookFilter(context: vscode.ExtensionContext): NotebookFilterManager {
	const manager = new NotebookFilterManager();
	context.subscriptions.push({ dispose: () => manager.dispose() });

	let reapplyTimer: ReturnType<typeof setTimeout> | undefined;
	const scheduleReapply = (notebook: vscode.NotebookDocument) => {
		if (!manager.isActive(notebook)) {
			return;
		}
		if (reapplyTimer) {
			clearTimeout(reapplyTimer);
		}
		reapplyTimer = setTimeout(() => {
			void manager.reapply(notebook);
		}, 150);
	};

	context.subscriptions.push(
		vscode.commands.registerCommand('jupyter-cell-tags.notebookFilter.set', async () => {
			const editor = vscode.window.activeNotebookEditor;
			if (!editor) {
				vscode.window.showWarningMessage('Open a Jupyter notebook to filter cells.');
				return;
			}
			const criteria = await promptForFilterCriteria();
			if (!criteria) {
				return;
			}
			const { matchCount, totalCount } = await manager.apply(editor.notebook, criteria);
			vscode.window.setStatusBarMessage(`Showing ${matchCount}/${totalCount} cells`, 3000);
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
		})
	);

	context.subscriptions.push(
		vscode.workspace.onDidChangeNotebookDocument(e => {
			scheduleReapply(e.notebook);
		}),
		vscode.window.onDidChangeActiveNotebookEditor(async editor => {
			await manager.syncUi(editor?.notebook);
		}),
		vscode.workspace.onDidCloseNotebookDocument(notebook => {
			manager.forget(notebook);
			void manager.syncUi();
		}),
		{ dispose: () => { if (reapplyTimer) { clearTimeout(reapplyTimer); } } }
	);

	void manager.syncUi();
	log('Notebook filter module activated.');
	return manager;
}
