import * as vscode from 'vscode';
import {
	EXISTING_TAG,
	Fixture,
	RUN_GROUP_TAG,
	activateExtension,
	closeEditors,
	openFixtureNotebook,
	selectCells
} from '../helpers/notebook';
import { kernelTestsEnabled } from '../helpers/kernel';
import { UiStubs } from '../helpers/uiStubs';

suite('Execution commands (kernel required)', () => {
	let editor: vscode.NotebookEditor;
	let stubs: UiStubs;

	suiteSetup(async function () {
		if (!kernelTestsEnabled()) {
			this.skip();
		}
		await activateExtension();
	});

	setup(async () => {
		stubs = new UiStubs();
		editor = await openFixtureNotebook();
	});

	teardown(async () => {
		stubs?.restore();
		await closeEditors();
	});

	test('executeRunCell', async () => {
		await vscode.commands.executeCommand('jupyter-cell-tags.executeRunCell', Fixture.taggedA);
	});

	test('runTag', async () => {
		await vscode.commands.executeCommand('jupyter-cell-tags.runTag', EXISTING_TAG);
	});

	test('executeRunGroup', async () => {
		stubs.stubCreateQuickPick(RUN_GROUP_TAG);
		await vscode.commands.executeCommand('jupyter-cell-tags.executeRunGroup');
	});

	test('executeAndSelectBelowWithTracking', async () => {
		selectCells(editor, Fixture.defineX);
		await vscode.commands.executeCommand('jupyter-cell-tags.executeAndSelectBelowWithTracking');
	});

	test('executeAndFocusContainerWithTracking', async () => {
		selectCells(editor, Fixture.defineX);
		await vscode.commands.executeCommand('jupyter-cell-tags.executeAndFocusContainerWithTracking');
	});

	test('jupyterEnhancements.execute', async () => {
		selectCells(editor, Fixture.defineX);
		await vscode.commands.executeCommand('jupyter-cell-tags.jupyterEnhancements.execute');
	});

	test('jupyterEnhancements.runInScratchpad', async () => {
		selectCells(editor, Fixture.defineX);
		await vscode.commands.executeCommand('jupyter-cell-tags.jupyterEnhancements.runInScratchpad');
	});

	test('listExecutedNotebookCells', async () => {
		await vscode.commands.executeCommand('jupyter-cell-tags.listExecutedNotebookCells');
	});

	test('createAndAddTagToAllExecutedCells', async () => {
		await vscode.commands.executeCommand('jupyter-cell-tags.createAndAddTagToAllExecutedCells');
	});

	test('navigate previous/next executed cell', async () => {
		selectCells(editor, Fixture.trailing);
		await vscode.commands.executeCommand('jupyter-cell-tags.navigateToPreviousExecutedCell');
		await vscode.commands.executeCommand('jupyter-cell-tags.navigateToNextExecutedCell');
	});

	test('exportExecutedCodeToPython', async () => {
		const dest = vscode.Uri.joinPath(editor.notebook.uri, '..', `executed-${Date.now()}.py`);
		stubs.stubSaveDialog(dest);
		await vscode.commands.executeCommand('jupyter-cell-tags.exportExecutedCodeToPython');
	});

	test('executedCells.selectCell', async () => {
		await vscode.commands.executeCommand('jupyter-cell-tags.executedCells.selectCell', Fixture.taggedA);
	});

	test('listKernels is registered and can be invoked with a cancelled pick', async () => {
		stubs.stubShowQuickPick('__none__');
		await vscode.commands.executeCommand('jupyter-cell-tags.listKernels');
	});
});
