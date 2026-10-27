import * as vscode from 'vscode';
import {
	Fixture,
	activateExtension,
	closeEditors,
	openFixtureNotebook,
	selectCells
} from '../helpers/notebook';

suite('Dependency chain commands', () => {
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

	test('showDependentCells and clearHighlights do not throw', async () => {
		selectCells(editor, Fixture.useX);
		await vscode.commands.executeCommand('jupyter-cell-tags.dependencyChain.showDependentCells');
		await vscode.commands.executeCommand('jupyter-cell-tags.dependencyChain.clearHighlights');
	});

	test('selectChain and revealCell ignore unknown snapshot ids', async () => {
		await vscode.commands.executeCommand(
			'jupyter-cell-tags.dependencyChain.selectChain',
			editor.notebook.uri.toString(),
			'missing-snapshot'
		);
		await vscode.commands.executeCommand(
			'jupyter-cell-tags.dependencyChain.revealCell',
			editor.notebook.uri.toString(),
			'missing-snapshot',
			Fixture.defineX
		);
	});
});
