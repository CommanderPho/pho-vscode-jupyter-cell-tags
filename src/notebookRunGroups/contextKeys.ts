// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import * as vscode from 'vscode';
import { RunGroup } from './enums';
import { getCellRunGroupMetadata } from './util/cellMetadataHelpers';

let _updateTimer: ReturnType<typeof setTimeout> | undefined;
const UPDATE_DEBOUNCE_MS = 100;

const _lastContext: {
	groupOneCells?: string;
	groupOneDocuments?: string;
	groupTwoCells?: string;
	groupTwoDocuments?: string;
	groupThreeCells?: string;
	groupThreeDocuments?: string;
} = {};

function uriSetKey(uris: Set<vscode.Uri>): string {
	return [...uris].map(u => u.toString()).sort().join('\0');
}

function setContextIfChanged(key: keyof typeof _lastContext, commandKey: string, uris: Set<vscode.Uri>): void {
	const serialized = uriSetKey(uris);
	if (_lastContext[key] === serialized) {
		return;
	}
	_lastContext[key] = serialized;
	void vscode.commands.executeCommand('setContext', commandKey, Array.from(uris));
}

/**
 * Update run-group context keys. Prefer the active notebook; fall back to a
 * light scan of open notebooks only when none is active (toolbar when clause).
 */
export function updateContextKeys(): void {
	const group1Cells: Set<vscode.Uri> = new Set<vscode.Uri>();
	const group2Cells: Set<vscode.Uri> = new Set<vscode.Uri>();
	const group3Cells: Set<vscode.Uri> = new Set<vscode.Uri>();
	const group1Documents: Set<vscode.Uri> = new Set<vscode.Uri>();
	const group2Documents: Set<vscode.Uri> = new Set<vscode.Uri>();
	const group3Documents: Set<vscode.Uri> = new Set<vscode.Uri>();

	const active = vscode.window.activeNotebookEditor?.notebook;
	const notebooks: readonly vscode.NotebookDocument[] = active
		? [active]
		: vscode.workspace.notebookDocuments;

	for (const notebookDocument of notebooks) {
		for (const cell of notebookDocument.getCells()) {
			const cellGroups = getCellRunGroupMetadata(cell);

			if (cellGroups.includes(RunGroup.one.toString())) {
				group1Cells.add(cell.document.uri);
				group1Documents.add(cell.notebook.uri);
			}
			if (cellGroups.includes(RunGroup.two.toString())) {
				group2Cells.add(cell.document.uri);
				group2Documents.add(cell.notebook.uri);
			}
			if (cellGroups.includes(RunGroup.three.toString())) {
				group3Cells.add(cell.document.uri);
				group3Documents.add(cell.notebook.uri);
			}
		}
	}

	setContextIfChanged('groupOneCells', 'notebookRunGroups.groupOneCells', group1Cells);
	setContextIfChanged('groupOneDocuments', 'notebookRunGroups.groupOneDocuments', group1Documents);
	setContextIfChanged('groupTwoCells', 'notebookRunGroups.groupTwoCells', group2Cells);
	setContextIfChanged('groupTwoDocuments', 'notebookRunGroups.groupTwoDocuments', group2Documents);
	setContextIfChanged('groupThreeCells', 'notebookRunGroups.groupThreeCells', group3Cells);
	setContextIfChanged('groupThreeDocuments', 'notebookRunGroups.groupThreeDocuments', group3Documents);
}

/** Debounced wrapper for hot editor-switch / document-open paths. */
export function scheduleUpdateContextKeys(): void {
	if (_updateTimer) {
		clearTimeout(_updateTimer);
	}
	_updateTimer = setTimeout(() => {
		_updateTimer = undefined;
		updateContextKeys();
	}, UPDATE_DEBOUNCE_MS);
}

export function disposeContextKeysScheduler(): void {
	if (_updateTimer) {
		clearTimeout(_updateTimer);
		_updateTimer = undefined;
	}
}
