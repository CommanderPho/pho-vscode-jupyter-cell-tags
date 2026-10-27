import * as assert from 'assert';
import * as vscode from 'vscode';
import { OutlineItem } from '../../customOutline/models';
import {
	Fixture,
	activateExtension,
	closeEditors,
	openFixtureNotebook,
	selectCells,
	selectedStarts
} from '../helpers/notebook';
import { UiStubs } from '../helpers/uiStubs';

function headingItem(cellIndex: number, text: string, childEnd: number): OutlineItem {
	return new OutlineItem(
		{ text, level: 1, lineNumber: 0 },
		cellIndex,
		new vscode.NotebookRange(cellIndex + 1, childEnd),
		vscode.TreeItemCollapsibleState.Collapsed
	);
}

suite('Custom outline commands', () => {
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

	test('showCustomNotebookOutline and clearFilter do not throw', async () => {
		await vscode.commands.executeCommand('jupyter-cell-tags.showCustomNotebookOutline');
		await vscode.commands.executeCommand('jupyter-cell-tags.customOutline.clearFilter');
	});

	test('customOutline.filter accepts stubbed input', async () => {
		stubs.stubInputBox('Heading');
		await vscode.commands.executeCommand('jupyter-cell-tags.customOutline.filter');
	});

	test('customOutline.selectCell selects the heading cell', async () => {
		const item = headingItem(Fixture.heading, 'Heading', editor.notebook.cellCount);
		await vscode.commands.executeCommand('jupyter-cell-tags.customOutline.selectCell', item);
		assert.ok(selectedStarts(editor).includes(Fixture.heading));
	});

	test('customOutline.selectAllChildCells selects the child range', async () => {
		const item = headingItem(Fixture.heading, 'Heading', Fixture.taggedB + 1);
		await vscode.commands.executeCommand('jupyter-cell-tags.customOutline.selectAllChildCells', item);
		assert.ok(editor.selections.length >= 1);
	});

	test('customOutline.deleteCellsUnderHeading deletes children after confirm', async () => {
		const before = editor.notebook.cellCount;
		const item = headingItem(Fixture.childHeading, 'Child', Fixture.taggedA + 1);
		stubs.stubWarningConfirm('Delete');
		selectCells(editor, Fixture.childHeading);
		await vscode.commands.executeCommand('jupyter-cell-tags.customOutline.deleteCellsUnderHeading', item);
		assert.ok(editor.notebook.cellCount <= before);
	});
});
