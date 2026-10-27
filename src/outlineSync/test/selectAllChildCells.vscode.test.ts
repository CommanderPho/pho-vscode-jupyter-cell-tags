/**
 * Integration tests for selectAllChildCells with outline synchronization.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import { OutlineSyncManager } from '../OutlineSyncManager';
import {
	EXISTING_TAG,
	activateExtension,
	closeEditors,
	openFixtureNotebook
} from '../../test/helpers/notebook';

suite('selectAllChildCells Integration Tests', () => {
	let outlineSyncManager: OutlineSyncManager;
	let editor: vscode.NotebookEditor;

	suiteSetup(async () => {
		await activateExtension();
	});

	setup(async () => {
		outlineSyncManager = new OutlineSyncManager();
		editor = await openFixtureNotebook();
	});

	teardown(async () => {
		outlineSyncManager.dispose();
		await closeEditors();
	});

	test('OutlineSyncManager is properly instantiated', () => {
		assert.ok(outlineSyncManager);
		const config = outlineSyncManager.getConfig();
		assert.strictEqual(config.enabled, true);
		assert.strictEqual(config.debounceMs, 300);
	});

	test('syncOutline can be called with an open notebook', async () => {
		await assert.doesNotReject(() => outlineSyncManager.syncOutline(editor));
	});

	test('syncOutline respects enabled flag', async () => {
		outlineSyncManager.setEnabled(false);
		const startTime = Date.now();
		await outlineSyncManager.syncOutline(editor);
		assert.ok(Date.now() - startTime < 50, 'Disabled sync should complete quickly');
		outlineSyncManager.setEnabled(true);
	});

	test('selectAllChildCells command is registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('jupyter-cell-tags.selectAllChildCells'));
	});

	test('selectAllChildCells handles a missing tag without throwing', async () => {
		await assert.doesNotReject(async () => {
			await vscode.commands.executeCommand(
				'jupyter-cell-tags.selectAllChildCells',
				`missing-tag-${Date.now()}`
			);
		});
	});

	test('selectAllChildCells selects cells for an existing tag', async () => {
		await vscode.commands.executeCommand('jupyter-cell-tags.selectAllChildCells', EXISTING_TAG);
		assert.ok(editor.selections.length >= 1);
	});

	test('outline synchronization completes within timing requirements', async () => {
		const startTime = Date.now();
		await outlineSyncManager.syncOutline(editor);
		assert.ok(Date.now() - startTime < 150, `Sync took ${Date.now() - startTime}ms`);
	});
});
