import * as assert from 'assert';
import * as vscode from 'vscode';
import {
	Fixture,
	activateExtension,
	cellAt,
	closeEditors,
	openFixtureNotebook,
	selectCells,
	selectedStarts
} from '../helpers/notebook';

suite('Heading commands', () => {
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

	test('selectCellsUnderHeading selects the heading and its children', async () => {
		selectCells(editor, Fixture.heading);
		await vscode.commands.executeCommand('jupyter-cell-tags.selectCellsUnderHeading');
		const starts = selectedStarts(editor);
		assert.ok(starts.includes(Fixture.heading) || editor.selection.start === Fixture.heading);
		assert.ok(editor.selection.end > Fixture.heading);
	});

	test('increaseSelectionHeadingDepth adds a hash to the heading', async () => {
		selectCells(editor, Fixture.heading);
		await vscode.commands.executeCommand('jupyter-cell-tags.increaseSelectionHeadingDepth');
		assert.match(cellAt(editor, Fixture.heading).document.getText(), /^##\s+Heading/);
	});

	test('decreaseSelectionHeadingDepth removes a hash from a nested heading', async () => {
		selectCells(editor, Fixture.childHeading);
		await vscode.commands.executeCommand('jupyter-cell-tags.decreaseSelectionHeadingDepth');
		assert.match(cellAt(editor, Fixture.childHeading).document.getText(), /^#\s+Child/);
	});

	test('deleteCellsUnderHeading does not throw (handler is currently a no-op)', async () => {
		selectCells(editor, Fixture.heading);
		await vscode.commands.executeCommand('jupyter-cell-tags.deleteCellsUnderHeading');
		assert.ok(editor.notebook.cellCount > 0);
	});
});
