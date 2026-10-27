import {
	DEFINE_X,
	EXISTING_TAG,
	GUI_SMOKE_TAG,
	TAGGED_A,
	acceptQuickPick,
	applyExistingTagFilter,
	clickTreeCellUnderTag,
	getCellTags,
	openFilterWebview,
	openFixtureNotebook,
	runPaletteCommand,
	selectCell,
	selectedIndices,
	tagsSection,
	waitForTagInTree
} from './workbench';
import { prepareGuiLaunch } from './launch';

describe('GUI smoke', () => {
	const launch = prepareGuiLaunch();

	before(async () => {
		await openFixtureNotebook(launch.fixturePath);
	});

	it('shows existing-tag in the All Notebook Tags view', async () => {
		await waitForTagInTree(EXISTING_TAG);
		const item = await (await tagsSection()).findItem(EXISTING_TAG);
		await expect(item).toBeDefined();
	});

	it('adds a tag from the Command Palette', async () => {
		await selectCell(DEFINE_X);
		await runPaletteCommand('Add Tag to Cell');
		await acceptQuickPick(GUI_SMOKE_TAG);
		await browser.waitUntil(
			async () => (await getCellTags(DEFINE_X)).includes(GUI_SMOKE_TAG),
			{ timeout: 15000, timeoutMsg: `Cell ${DEFINE_X} did not receive ${GUI_SMOKE_TAG}` }
		);
	});

	it('selects a notebook cell when clicking the tags tree', async () => {
		await waitForTagInTree(EXISTING_TAG);
		await clickTreeCellUnderTag(EXISTING_TAG, 'Cell 3');
		await browser.waitUntil(
			async () => (await selectedIndices()).includes(TAGGED_A),
			{ timeout: 15000, timeoutMsg: `Clicking Cell 3 did not select index ${TAGGED_A}` }
		);
	});

	it('applies the notebook cell filter from the webview', async () => {
		await openFilterWebview();
		const status = await applyExistingTagFilter();
		await expect(status).toContain('Showing 2/9 cells');
	});
});
