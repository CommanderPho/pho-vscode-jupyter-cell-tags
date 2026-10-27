import * as vscode from 'vscode';
import {
	Fixture,
	activateExtension,
	closeEditors,
	openFixtureNotebook,
	selectCells,
	selectedStarts
} from '../helpers/notebook';
import * as assert from 'assert';

suite('Git diff commands', () => {
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

	test('clearHighlights and refreshModifiedCells do not throw', async () => {
		await vscode.commands.executeCommand('jupyter-cell-tags.gitDiff.clearHighlights');
		await vscode.commands.executeCommand('jupyter-cell-tags.gitDiff.refreshModifiedCells');
	});

	test('selectModifiedCell selects the given index', async () => {
		await vscode.commands.executeCommand('jupyter-cell-tags.gitDiff.selectModifiedCell', Fixture.taggedA);
		assert.ok(selectedStarts(editor).includes(Fixture.taggedA));
	});

	test('highlightChangedCells and vsHead do not throw outside a git repo', async () => {
		selectCells(editor, Fixture.heading);
		await vscode.commands.executeCommand('jupyter-cell-tags.gitDiff.highlightChangedCells');
		await vscode.commands.executeCommand('jupyter-cell-tags.gitDiff.highlightChangedCellsVsHead');
	});
});
