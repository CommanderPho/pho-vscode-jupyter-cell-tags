import { InputBox, type TreeItem } from 'wdio-vscode-service';

export const EXISTING_TAG = 'existing-tag';
export const GUI_SMOKE_TAG = 'gui-smoke-tag';
export const DEFINE_X = 5;
export const TAGGED_A = 2;

type WorkbenchApi = {
	window: {
		activeNotebookEditor?: {
			notebook: {
				cellCount: number;
				cellAt: (index: number) => { metadata: Record<string, unknown>; index: number };
			};
			selections: unknown;
		};
		showNotebookDocument: (document: unknown) => Promise<unknown>;
	};
	workspace: {
		openNotebookDocument: (uri: unknown) => Promise<unknown>;
	};
	commands: {
		executeCommand: (command: string, ...args: unknown[]) => Promise<unknown>;
	};
	Uri: { file: (fsPath: string) => unknown };
	NotebookRange: new (start: number, end: number) => unknown;
};

export async function openFixtureNotebook(fixturePath: string): Promise<void> {
	await browser.executeWorkbench(async (vscode: WorkbenchApi, notebookPath: string) => {
		const uri = vscode.Uri.file(notebookPath);
		const document = await vscode.workspace.openNotebookDocument(uri);
		await vscode.window.showNotebookDocument(document);
	}, fixturePath);
	await browser.waitUntil(
		async () =>
			browser.executeWorkbench((vscode: WorkbenchApi) => Boolean(vscode.window.activeNotebookEditor)),
		{ timeout: 20000, timeoutMsg: 'Notebook did not become active' }
	);
}

export async function selectCell(index: number): Promise<void> {
	await browser.executeWorkbench((vscode: WorkbenchApi, cellIndex: number) => {
		const editor = vscode.window.activeNotebookEditor;
		if (!editor) {
			throw new Error('No active notebook editor');
		}
		editor.selections = [new vscode.NotebookRange(cellIndex, cellIndex + 1)];
	}, index);
}

export async function getCellTags(index: number): Promise<string[]> {
	return browser.executeWorkbench((vscode: WorkbenchApi, cellIndex: number) => {
		const editor = vscode.window.activeNotebookEditor;
		if (!editor) {
			return [];
		}
		const metadata = editor.notebook.cellAt(cellIndex).metadata;
		const custom = metadata.custom as { metadata?: { tags?: string[] } } | undefined;
		const nested = metadata.metadata as { tags?: string[] } | undefined;
		return custom?.metadata?.tags ?? nested?.tags ?? (metadata.tags as string[] | undefined) ?? [];
	}, index);
}

export async function selectedIndices(): Promise<number[]> {
	return browser.executeWorkbench((vscode: WorkbenchApi) => {
		const editor = vscode.window.activeNotebookEditor;
		if (!editor) {
			return [];
		}
		const indices = new Set<number>();
		for (const range of editor.selections as { start: number; end: number }[]) {
			for (let index = range.start; index < range.end; index++) {
				indices.add(index);
			}
		}
		return [...indices];
	});
}

export async function focusView(viewId: string): Promise<void> {
	await browser.executeWorkbench(async (vscode: WorkbenchApi, id: string) => {
		await vscode.commands.executeCommand('workbench.view.explorer');
		await vscode.commands.executeCommand(`${id}.focus`);
	}, viewId);
}

export async function tagsSection() {
	const workbench = await browser.getWorkbench();
	const sidebar = await workbench.getSideBar();
	const content = await sidebar.getContent();
	const titles = ['All Notebook Tags', '🏷️ All Notebook Tags', 'Notebook Tags'];
	for (const title of titles) {
		try {
			return await content.getSection(title);
		} catch {
			/* try next title or scan sections */
		}
	}
	const sections = await content.getSections();
	for (const section of sections) {
		const title = await section.getTitle();
		if (title.includes('Notebook Tags') || title.includes('All Notebook Tags')) {
			return section;
		}
	}
	const found = await Promise.all(sections.map((section) => section.getTitle()));
	throw new Error(`Could not find All Notebook Tags sidebar section (found: ${found.join(', ') || 'none'})`);
}

export async function waitForTagInTree(tag: string): Promise<string> {
	await focusView('all-notebook-tags-view');
	await browser.waitUntil(
		async () => {
			try {
				const section = await tagsSection();
				const item = await section.findItem(tag);
				return Boolean(item);
			} catch {
				return false;
			}
		},
		{ timeout: 20000, timeoutMsg: `Tree did not show tag ${tag}` }
	);
	return tag;
}

export async function clickTreeCellUnderTag(tag: string, cellLabel: string): Promise<void> {
	const section = await tagsSection();
	await section.expand();
	const tagItem = (await section.findItem(tag)) as TreeItem | undefined;
	if (!tagItem) {
		throw new Error(`Tag item ${tag} not found`);
	}
	await tagItem.expand();
	const child = await tagItem.findChildItem(cellLabel);
	if (!child) {
		throw new Error(`Child ${cellLabel} not found under ${tag}`);
	}
	await child.select();
}

export async function runPaletteCommand(title: string): Promise<void> {
	await browser.keys(['Escape']);
	await browser.keys(['F1']);
	const workbench = await browser.getWorkbench();
	const input = new InputBox(workbench.locatorMap);
	await input.wait(15000);
	await input.setText(title);
	try {
		await input.selectQuickPick(title);
	} catch {
		await input.confirm();
	}
}

export async function acceptQuickPick(value: string): Promise<void> {
	const workbench = await browser.getWorkbench();
	const input = new InputBox(workbench.locatorMap);
	await input.wait(15000);
	await input.setText(value);
	try {
		await input.selectQuickPick(value);
	} catch {
		await input.confirm();
	}
}

export async function openFilterWebview(): Promise<void> {
	await focusView('notebook-cell-filter-view');
	const workbench = await browser.getWorkbench();
	await browser.waitUntil(
		async () => {
			const webviews = await workbench.getAllWebviews();
			return webviews.length > 0;
		},
		{ timeout: 20000, timeoutMsg: 'Filter webview did not appear' }
	);
}

export async function applyExistingTagFilter(): Promise<string> {
	const workbench = await browser.getWorkbench();
	let webview;
	try {
		webview = await workbench.getWebviewByTitle(/Filter/i);
	} catch {
		const webviews = await workbench.getAllWebviews();
		if (webviews.length === 0) {
			throw new Error('No webviews found');
		}
		webview = webviews[webviews.length - 1];
	}
	await webview.open();
	try {
		const checkbox = await $('input[type="checkbox"][value="existing-tag"]');
		await checkbox.waitForExist({ timeout: 15000 });
		if (!(await checkbox.isSelected())) {
			await checkbox.click();
		}
		const apply = await $('[data-testid="notebook-filter-apply"]');
		await apply.click();
		const status = await $('#status');
		await browser.waitUntil(
			async () => {
				const text = await status.getText();
				return text.includes('Showing 2/9 cells');
			},
			{ timeout: 15000, timeoutMsg: 'Filter status did not show 2/9 cells' }
		);
		return status.getText();
	} finally {
		await webview.close();
	}
}
