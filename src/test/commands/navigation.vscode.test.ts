import * as assert from 'assert';
import * as vscode from 'vscode';
import {
	Fixture,
	activateExtension,
	closeEditors,
	openFixtureNotebook,
	selectCells,
	selectedStarts
} from '../helpers/notebook';
import { UiStubs } from '../helpers/uiStubs';

suite('Navigation and display commands', () => {
	let editor: vscode.NotebookEditor;
	let stubs: UiStubs;

	suiteSetup(async () => {
		await activateExtension();
	});

	setup(async () => {
		stubs = new UiStubs();
		editor = await openFixtureNotebook();
	});

	teardown(async () => {
		stubs.restore();
		await closeEditors();
	});

	test('navigateDownToNextErrorCell moves to the error fixture cell', async () => {
		selectCells(editor, Fixture.heading);
		await vscode.commands.executeCommand('jupyter-cell-tags.navigateDownToNextErrorCell');
		assert.ok(selectedStarts(editor).includes(Fixture.error));
	});

	test('navigateUpToPreviousErrorCell moves back to the error fixture cell', async () => {
		selectCells(editor, Fixture.trailing);
		await vscode.commands.executeCommand('jupyter-cell-tags.navigateUpToPreviousErrorCell');
		assert.ok(selectedStarts(editor).includes(Fixture.error));
	});

	test('showNavigationMenu accepts a stubbed pick', async () => {
		selectCells(editor, Fixture.heading);
		stubs.stubShowQuickPick('Next Error Cell');
		await vscode.commands.executeCommand('jupyter-cell-tags.showNavigationMenu');
	});

	test('toggleCellMetadataDisplay does not throw', async () => {
		selectCells(editor, Fixture.taggedA);
		await vscode.commands.executeCommand('jupyter-cell-tags.toggleCellMetadataDisplay');
	});

	test('ringMeJupyter.toggleBell flips notifyOnComplete', async () => {
		const cell = editor.notebook.cellAt(Fixture.defineX);
		selectCells(editor, Fixture.defineX);
		await vscode.commands.executeCommand('jupyter-cell-tags.ringMeJupyter.toggleBell', cell);
		assert.strictEqual(editor.notebook.cellAt(Fixture.defineX).metadata?.notifyOnComplete, true);
	});
});
