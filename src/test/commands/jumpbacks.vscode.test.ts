import * as assert from 'assert';
import * as vscode from 'vscode';
import { JumpbackDataSource, isNotebookJumpback } from '../../cellJumpbacks/jumpbackDataSource';
import {
	Fixture,
	activateExtension,
	cellAt,
	closeEditors,
	openFixtureNotebook,
	selectCells,
	selectedStarts
} from '../helpers/notebook';
import { waitFor } from '../helpers/waitFor';

suite('Jumpback commands', () => {
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

	test('addJumpback and removeJumpback persist notebook metadata', async () => {
		selectCells(editor, Fixture.defineX);
		await vscode.commands.executeCommand('jupyter-cell-tags.addJumpback', cellAt(editor, Fixture.defineX));
		await waitFor(() =>
			JumpbackDataSource.loadFromNotebook(editor.notebook)
				.getList()
				.some((entry) => isNotebookJumpback(entry) && entry.cellIndex === Fixture.defineX)
		);

		await vscode.commands.executeCommand('jupyter-cell-tags.removeJumpback', cellAt(editor, Fixture.defineX));
		await waitFor(
			() =>
				!JumpbackDataSource.loadFromNotebook(editor.notebook)
					.getList()
					.some((entry) => isNotebookJumpback(entry) && entry.cellIndex === Fixture.defineX)
		);
	});

	test('openJumpback reveals the stored cell', async () => {
		selectCells(editor, Fixture.useX);
		await vscode.commands.executeCommand('jupyter-cell-tags.addJumpback', cellAt(editor, Fixture.useX));
		const entry = JumpbackDataSource.loadFromNotebook(editor.notebook)
			.getList()
			.find((item) => isNotebookJumpback(item) && item.cellIndex === Fixture.useX);
		assert.ok(entry);
		selectCells(editor, Fixture.heading);
		await vscode.commands.executeCommand('jupyter-cell-tags.openJumpback', {
			entry,
			targetUri: editor.notebook.uri
		});
		assert.ok(selectedStarts(editor).includes(Fixture.useX));
	});

	test('show and refresh jumpback view do not throw', async () => {
		await vscode.commands.executeCommand('jupyter-cell-tags.showAllNotebookJumpbacks');
		await vscode.commands.executeCommand('jupyter-cell-tags.refreshJumpbacks');
	});
});
