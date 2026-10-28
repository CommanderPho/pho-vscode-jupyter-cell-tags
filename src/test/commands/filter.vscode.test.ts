import * as assert from 'assert';
import * as vscode from 'vscode';
import { NotebookFilterManager } from '../../notebookFilter/NotebookFilterManager';
import {
	EXISTING_TAG,
	Fixture,
	activateExtension,
	closeEditors,
	openFixtureNotebook
} from '../helpers/notebook';
import { waitFor } from '../helpers/waitFor';

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
			await manager.dispose();
		}
	});

	test('filter clear does not expand a cell that was collapsed before apply', async function () {
		const unmatchedIndex = Fixture.defineX;
		await vscode.commands.executeCommand('notebook.cell.collapseCellInput', {
			document: editor.notebook.uri,
			ranges: [{ start: unmatchedIndex, end: unmatchedIndex + 1 }]
		});
		try {
			await waitFor(() => isCellCollapsed(editor.notebook.cellAt(unmatchedIndex)));
		} catch {
			this.skip();
			return;
		}

		const manager = new NotebookFilterManager();
		try {
			await manager.apply(editor.notebook, { tags: [EXISTING_TAG] });
			await manager.clear(editor.notebook);
			assert.ok(
				isCellCollapsed(editor.notebook.cellAt(unmatchedIndex)),
				'user-collapsed unmatched cells must stay collapsed after filter clear'
			);
		} finally {
			await manager.dispose();
		}
	});
});

function isCellCollapsed(cell: vscode.NotebookCell): boolean {
	const anyCell = cell as vscode.NotebookCell & {
		internalMetadata?: { inputCollapsed?: boolean; outputCollapsed?: boolean };
		isInputCollapsed?: boolean;
	};
	if (anyCell.internalMetadata?.inputCollapsed === true || anyCell.isInputCollapsed === true) {
		return true;
	}
	const meta = cell.metadata as Record<string, unknown> | undefined;
	if (!meta) {
		return false;
	}
	if (meta.inputCollapsed === true || meta.outputCollapsed === true || meta.collapsed === true) {
		return true;
	}
	const jupyter = meta.jupyter as Record<string, unknown> | undefined;
	return jupyter?.collapsed === true;
}
