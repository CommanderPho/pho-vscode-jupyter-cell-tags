import * as assert from 'assert';
import * as vscode from 'vscode';
import { OutlineItem } from '../../customOutline/models';
import { getFilterManager } from '../../notebookFilter/startup';
import { FeatureKey } from '../../util/featureFlags';
import { FeatureController, whenFeatureTogglesIdle } from '../../util/featureLifecycle';
import {
	EXISTING_TAG,
	Fixture,
	activateExtension,
	cellAt,
	closeEditors,
	openFixtureNotebook,
	selectCells,
	selectedStarts
} from '../helpers/notebook';
import { waitFor } from '../helpers/waitFor';

const WORKSPACE = vscode.ConfigurationTarget.Workspace;

function headingItem(cellIndex: number, text: string, childEnd: number): OutlineItem {
	return new OutlineItem(
		{ text, level: 1, lineNumber: 0 },
		cellIndex,
		new vscode.NotebookRange(cellIndex + 1, childEnd),
		vscode.TreeItemCollapsibleState.Collapsed
	);
}

async function commandRegistered(id: string): Promise<boolean> {
	const commands = await vscode.commands.getCommands(true);
	return commands.includes(id);
}

async function setFeature(feature: FeatureKey, value: boolean): Promise<void> {
	const config = vscode.workspace.getConfiguration('jupyter-cell-tags');
	await config.update(`features.${feature}`, value, WORKSPACE);
	await whenFeatureTogglesIdle();
}

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

suite('Feature hot-toggle', () => {
	const restored: FeatureKey[] = [];

	suiteSetup(async () => {
		await activateExtension();
	});

	suiteTeardown(async () => {
		for (const feature of restored) {
			await setFeature(feature, true);
		}
		await closeEditors();
	});

	teardown(async () => {
		for (const feature of restored.splice(0)) {
			await setFeature(feature, true);
		}
		await closeEditors();
	});

	async function toggle(feature: FeatureKey, value: boolean): Promise<void> {
		if (!restored.includes(feature)) {
			restored.push(feature);
		}
		await setFeature(feature, value);
	}

	test('FeatureController serializes fake activator enable/disable', async () => {
		let activations = 0;
		let disposals = 0;
		let enabled = false;
		const parent = { subscriptions: [] } as unknown as vscode.ExtensionContext;
		const controller = new FeatureController(
			parent,
			{
				jumpbacks: {
					activate: (ctx) => {
						activations += 1;
						ctx.subscriptions.push({
							dispose: () => {
								disposals += 1;
							}
						});
					}
				}
			},
			() => enabled
		);

		await controller.start();
		assert.strictEqual(activations, 0);

		enabled = true;
		await controller.start();
		assert.strictEqual(activations, 1);
		assert.ok(controller.isLive('jumpbacks'));

		enabled = false;
		await controller.start();
		assert.strictEqual(disposals, 1);
		assert.ok(!controller.isLive('jumpbacks'));

		enabled = true;
		await controller.start();
		assert.strictEqual(activations, 2);

		enabled = false;
		await controller.start();
		assert.strictEqual(disposals, 2);
		controller.dispose();
		await controller.whenIdle();
	});

	test('customOutline bounce re-registers show/selectCell', async () => {
		const editor = await openFixtureNotebook();
		await toggle('customOutline', false);
		await waitFor(async () => !(await commandRegistered('jupyter-cell-tags.showCustomNotebookOutline')));
		await toggle('customOutline', true);
		await waitFor(async () => commandRegistered('jupyter-cell-tags.showCustomNotebookOutline'));
		await waitFor(async () => commandRegistered('jupyter-cell-tags.customOutline.selectCell'));

		await vscode.commands.executeCommand('jupyter-cell-tags.showCustomNotebookOutline');
		const item = headingItem(Fixture.heading, 'Heading', editor.notebook.cellCount);
		await vscode.commands.executeCommand('jupyter-cell-tags.customOutline.selectCell', item);
		assert.ok(selectedStarts(editor).includes(Fixture.heading));
	});

	test('jumpbacks command is gone when disabled and works after re-enable', async () => {
		const editor = await openFixtureNotebook();
		await toggle('jumpbacks', false);
		await waitFor(async () => !(await commandRegistered('jupyter-cell-tags.addJumpback')));
		await assert.rejects(
			async () => {
				await vscode.commands.executeCommand('jupyter-cell-tags.addJumpback');
			},
			/not found/i
		);

		await toggle('jumpbacks', true);
		await waitFor(async () => commandRegistered('jupyter-cell-tags.addJumpback'));
		selectCells(editor, Fixture.defineX);
		await vscode.commands.executeCommand('jupyter-cell-tags.addJumpback', cellAt(editor, Fixture.defineX));
	});

	test('disabling notebookFilter expands cells collapsed by the filter', async () => {
		const editor = await openFixtureNotebook();
		const manager = getFilterManager();
		assert.ok(manager, 'notebookFilter manager should be live');
		const result = await manager.apply(editor.notebook, { tags: [EXISTING_TAG] });
		assert.ok(manager.isActive(editor.notebook), 'filter should be active after apply');
		assert.ok(result.matchCount < result.totalCount, 'filter should collapse unmatched cells');
		const collapsedBefore = editor.notebook.getCells().filter(isCellCollapsed);

		await toggle('notebookFilter', false);
		await waitFor(() => getFilterManager() === undefined);
		await waitFor(async () => !(await commandRegistered('jupyter-cell-tags.notebookFilter.set')));
		if (collapsedBefore.length > 0) {
			await waitFor(() => editor.notebook.getCells().every((cell) => !isCellCollapsed(cell)));
		}
		assert.ok(editor.notebook.getCells().every((cell) => !isCellCollapsed(cell)));
	});
});
