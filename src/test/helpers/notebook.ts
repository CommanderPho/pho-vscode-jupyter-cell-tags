import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { getCellTags } from '../../helper';
import { waitFor } from './waitFor';

/** Fixture cell indices in `command-matrix.ipynb`. */
export const Fixture = {
	heading: 0,
	childHeading: 1,
	taggedA: 2,
	taggedB: 3,
	runGroup: 4,
	defineX: 5,
	useX: 6,
	error: 7,
	trailing: 8
} as const;

export const EXISTING_TAG = 'existing-tag';
export const RUN_GROUP_TAG = 'run-group';

function fixtureSourcePath(): string {
	return path.resolve(__dirname, '../../../src/test/fixtures/command-matrix.ipynb');
}

export async function activateExtension(): Promise<vscode.Extension<unknown>> {
	const ext = vscode.extensions.getExtension('phohale.pho-vscode-jupyter-cell-tags');
	assert.ok(ext, 'Extension phohale.pho-vscode-jupyter-cell-tags should be present');
	if (!ext.isActive) {
		await ext.activate();
	}
	return ext;
}

export async function closeEditors(): Promise<void> {
	await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}

export async function openFixtureNotebook(): Promise<vscode.NotebookEditor> {
	const destDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jct-cmd-matrix-'));
	const dest = path.join(destDir, `command-matrix-${Date.now()}.ipynb`);
	fs.copyFileSync(fixtureSourcePath(), dest);
	const uri = vscode.Uri.file(dest);
	const document = await vscode.workspace.openNotebookDocument(uri);
	const editor = await vscode.window.showNotebookDocument(document);
	await waitFor(() => vscode.window.activeNotebookEditor?.notebook.uri.toString() === uri.toString());
	// Let tree providers debounce-index tags from the newly opened notebook.
	await new Promise((resolve) => setTimeout(resolve, 400));
	return editor;
}

export function selectCells(editor: vscode.NotebookEditor, ...indices: number[]): void {
	editor.selections = indices.map((index) => new vscode.NotebookRange(index, index + 1));
}

export function assertCellTags(cell: vscode.NotebookCell, expected: string[]): void {
	assert.deepStrictEqual(getCellTags(cell).slice().sort(), expected.slice().sort());
}

export function cellAt(editor: vscode.NotebookEditor, index: number): vscode.NotebookCell {
	assert.ok(index >= 0 && index < editor.notebook.cellCount, `cell ${index} out of range`);
	return editor.notebook.cellAt(index);
}

export function selectedStarts(editor: vscode.NotebookEditor): number[] {
	return editor.selections.map((range) => range.start).sort((a, b) => a - b);
}

/** Cell indices covered by notebook selections (ranges are end-exclusive and may be coalesced). */
export function selectedIndices(editor: vscode.NotebookEditor): number[] {
	const indices = new Set<number>();
	for (const range of editor.selections) {
		for (let index = range.start; index < range.end; index++) {
			indices.add(index);
		}
	}
	return [...indices].sort((a, b) => a - b);
}

interface TagsTreeProvider {
	getCellReferencesForTag?(tag: string): { index: number }[] | undefined;
}

export async function waitForTagIndexed(tag: string, ...cellIndices: number[]): Promise<void> {
	await waitFor(() => {
		const provider = (globalThis as { _debug?: { tagsTreeProvider?: TagsTreeProvider } })._debug
			?.tagsTreeProvider;
		const refs = provider?.getCellReferencesForTag?.(tag) ?? [];
		const found = new Set(refs.map((ref) => ref.index));
		return cellIndices.every((index) => found.has(index));
	});
}
