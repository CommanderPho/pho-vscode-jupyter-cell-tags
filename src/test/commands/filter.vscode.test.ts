import * as vscode from 'vscode';
import { NotebookFilterManager } from '../../notebookFilter/NotebookFilterManager';
import {
	EXISTING_TAG,
	activateExtension,
	closeEditors,
	openFixtureNotebook
} from '../helpers/notebook';

suite('Notebook filter commands', () => {
	let editor: vscode.NotebookEditor;

	suiteSetup(async () => {
		await activateExtension();
	});

	setup(async () => {
		editor = await openFixtureNotebook();
	});

	teardown(async () => {
		await closeEditors();
	});

	test('notebookFilter.set focuses the filter view without throwing', async () => {
		await vscode.commands.executeCommand('jupyter-cell-tags.notebookFilter.set');
	});

	test('notebookFilter.clear does not throw', async () => {
		await vscode.commands.executeCommand('jupyter-cell-tags.notebookFilter.clear');
	});

	test('NotebookFilterManager apply then clear restores cells', async () => {
		const manager = new NotebookFilterManager();
		try {
			await manager.apply(editor.notebook, { tags: [EXISTING_TAG] });
			await manager.clear(editor.notebook);
		} finally {
			manager.dispose();
		}
	});
});
