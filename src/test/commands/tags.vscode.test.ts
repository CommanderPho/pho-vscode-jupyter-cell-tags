import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { TagPropertiesManager } from '../../tagProperties/tagPropertiesManager';
import { getCellTags } from '../../helper';
import {
	EXISTING_TAG,
	Fixture,
	activateExtension,
	assertCellTags,
	cellAt,
	closeEditors,
	openFixtureNotebook,
	selectCells,
	selectedIndices,
	selectedStarts,
	waitForTagIndexed
} from '../helpers/notebook';
import { UiStubs } from '../helpers/uiStubs';
import { waitFor } from '../helpers/waitFor';

suite('Tag and metadata commands', () => {
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

	test('paramaterize adds the parameters tag', async () => {
		selectCells(editor, Fixture.defineX);
		await vscode.commands.executeCommand('jupyter-cell-tags.paramaterize', cellAt(editor, Fixture.defineX));
		assertCellTags(cellAt(editor, Fixture.defineX), ['parameters']);
	});

	test('removeTag removes an existing tag', async () => {
		const cell = cellAt(editor, Fixture.taggedA);
		await vscode.commands.executeCommand('jupyter-cell-tags.removeTag', cell, EXISTING_TAG);
		assert.ok(!getCellTags(cell).includes(EXISTING_TAG));
	});

	test('addTag adds a stubbed Quick Pick tag', async () => {
		selectCells(editor, Fixture.defineX);
		stubs.stubCreateQuickPick('from-add-tag');
		await vscode.commands.executeCommand('jupyter-cell-tags.addTag', cellAt(editor, Fixture.defineX));
		await waitFor(() => getCellTags(cellAt(editor, Fixture.defineX)).includes('from-add-tag'));
	});

	test('addTagsToSelectedCells tags every selected cell', async () => {
		selectCells(editor, Fixture.defineX, Fixture.useX);
		stubs.stubCreateQuickPick('multi-tag');
		await vscode.commands.executeCommand('jupyter-cell-tags.addTagsToSelectedCells');
		await waitFor(
			() =>
				getCellTags(cellAt(editor, Fixture.defineX)).includes('multi-tag') &&
				getCellTags(cellAt(editor, Fixture.useX)).includes('multi-tag')
		);
	});

	test('editTagsInJSON opens the notebook as text', async () => {
		selectCells(editor, Fixture.taggedA);
		await vscode.commands.executeCommand('jupyter-cell-tags.editTagsInJSON', cellAt(editor, Fixture.taggedA));
		const textEditor = await waitFor(() =>
			vscode.window.visibleTextEditors.find(
				(visible) => visible.document.uri.toString() === editor.notebook.uri.toString()
			)
		);
		assert.ok(textEditor);
	});

	test('selectAllChildCells selects cells with the tag', async () => {
		await waitFor(() => getCellTags(cellAt(editor, Fixture.taggedA)).includes(EXISTING_TAG));
		await waitFor(() => getCellTags(cellAt(editor, Fixture.taggedB)).includes(EXISTING_TAG));
		await waitForTagIndexed(EXISTING_TAG, Fixture.taggedA, Fixture.taggedB);
		await vscode.commands.executeCommand('jupyter-cell-tags.selectAllChildCells', EXISTING_TAG);
		const indices = selectedIndices(editor);
		assert.ok(indices.includes(Fixture.taggedA), `expected cell ${Fixture.taggedA} selected, got ${indices.join(',')}`);
		assert.ok(indices.includes(Fixture.taggedB), `expected cell ${Fixture.taggedB} selected, got ${indices.join(',')}`);
	});

	test('selectAllCellsUnderTag does not throw', async () => {
		await vscode.commands.executeCommand('jupyter-cell-tags.selectAllCellsUnderTag', EXISTING_TAG);
	});

	test('renameTag rewrites the tag on tagged cells', async () => {
		stubs.stubInputBox('renamed-tag');
		await vscode.commands.executeCommand('jupyter-cell-tags.renameTag', EXISTING_TAG);
		await waitFor(
			() =>
				getCellTags(cellAt(editor, Fixture.taggedA)).includes('renamed-tag') &&
				getCellTags(cellAt(editor, Fixture.taggedB)).includes('renamed-tag')
		);
	});

	test('setTagColor and clearTagColor update notebook tagProperties', async () => {
		stubs.stubShowQuickPick('Red');
		await vscode.commands.executeCommand('jupyter-cell-tags.setTagColor', EXISTING_TAG);
		await waitFor(() => TagPropertiesManager.getTagProperties(editor.notebook, EXISTING_TAG).color === '#e74c3c');

		await vscode.commands.executeCommand('jupyter-cell-tags.clearTagColor', EXISTING_TAG);
		await waitFor(() => !TagPropertiesManager.getTagProperties(editor.notebook, EXISTING_TAG).color);
	});

	test('setTagPriority writes a numeric priority', async () => {
		stubs.stubInputBox('3');
		await vscode.commands.executeCommand('jupyter-cell-tags.setTagPriority', EXISTING_TAG);
		await waitFor(() => TagPropertiesManager.getTagProperties(editor.notebook, EXISTING_TAG).priority === 3);
	});

	test('changeSortOrder accepts a stubbed pick', async () => {
		stubs.stubShowQuickPick('Alphabetical');
		await vscode.commands.executeCommand('jupyter-cell-tags.changeSortOrder');
	});

	test('removeTagFromAllCells removes the tag after confirm', async () => {
		stubs.stubWarningConfirm('Confirm');
		await vscode.commands.executeCommand('jupyter-cell-tags.removeTagFromAllCells', EXISTING_TAG);
		await waitFor(
			() =>
				!getCellTags(cellAt(editor, Fixture.taggedA)).includes(EXISTING_TAG) &&
				!getCellTags(cellAt(editor, Fixture.taggedB)).includes(EXISTING_TAG)
		);
	});

	test('exportTags writes a JSON file', async () => {
		const dest = vscode.Uri.file(path.join(os.tmpdir(), `tags-export-${Date.now()}.json`));
		stubs.stubSaveDialog(dest);
		await vscode.commands.executeCommand('jupyter-cell-tags.exportTags');
		await waitFor(() => fs.existsSync(dest.fsPath));
		const parsed = JSON.parse(fs.readFileSync(dest.fsPath, 'utf8')) as { tags?: string[] }[];
		assert.ok(parsed.some((row) => row.tags?.includes(EXISTING_TAG)));
	});

	test('importTags applies JSON tags to cells', async () => {
		const dest = vscode.Uri.file(path.join(os.tmpdir(), `tags-import-${Date.now()}.json`));
		fs.writeFileSync(
			dest.fsPath,
			JSON.stringify({
				[Fixture.defineX]: ['imported-tag']
			})
		);
		stubs.stubOpenDialog(dest);
		await vscode.commands.executeCommand('jupyter-cell-tags.importTags');
		await waitFor(() => getCellTags(cellAt(editor, Fixture.defineX)).includes('imported-tag'));
	});

	test('showAllNotebookTags and refreshEntry do not throw', async () => {
		await vscode.commands.executeCommand('jupyter-cell-tags.showAllNotebookTags');
		await vscode.commands.executeCommand('jupyter-cell-tags.refreshEntry');
	});

	test('openNotebookCell selects the requested index', async () => {
		await vscode.commands.executeCommand('jupyter-cell-tags.openNotebookCell', Fixture.useX);
		assert.ok(selectedStarts(editor).includes(Fixture.useX));
	});
});
