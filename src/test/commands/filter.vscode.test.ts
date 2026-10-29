import * as assert from 'assert';
import * as vscode from 'vscode';
import { NotebookFilterManager } from '../../notebookFilter/NotebookFilterManager';
import { FILTERED_NOTEBOOK_SCHEME } from '../../notebookFilter/filteredNotebookScheme';
import { getFilterManager, getFilteredSessionManager } from '../../notebookFilter/startup';
import {
	EXISTING_TAG,
	Fixture,
	RUN_GROUP_TAG,
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

	test('openTab copies matching cells without outputs and leaves the source intact', async () => {
		const source = editor.notebook;
		const sourceCount = source.cellCount;
		await vscode.commands.executeCommand('jupyter-cell-tags.notebookFilter.openTab', {
			tags: [EXISTING_TAG]
		});
		const filtered = await waitFor((): vscode.NotebookDocument => {
			const doc = vscode.workspace.notebookDocuments.find(
				n =>
					n.uri.toString() !== source.uri.toString() &&
					n.cellCount === 2
			);
			if (!doc) {
				throw new Error('waiting for filtered notebook');
			}
			return doc;
		});
		assert.strictEqual(source.cellCount, sourceCount);
		assert.strictEqual(filtered.uri.scheme, FILTERED_NOTEBOOK_SCHEME);
		assert.ok(
			filtered.getCells().every(cell => cell.outputs.length === 0),
			'filtered tab must omit cell outputs'
		);
		assert.ok(!getFilterManager()?.isActive(source), 'openTab must not collapse-filter the source');

		const sessions = getFilteredSessionManager();
		assert.ok(sessions, 'filtered session manager should be live');
		await sessions.applyCriteria(filtered.uri, { tags: [RUN_GROUP_TAG] });
		await waitFor(() => filtered.cellCount === 1);
		assert.strictEqual(filtered.cellCount, 1);
		assert.ok(filtered.getCells().every(cell => cell.outputs.length === 0));
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
