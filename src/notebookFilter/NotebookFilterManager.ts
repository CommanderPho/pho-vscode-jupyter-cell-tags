import * as vscode from 'vscode';
import { log } from '../util/logging';
import {
	cellHasOutputs,
	cellMatchesFilter,
	isFilterActive,
	NotebookFilterCriteria,
	summarizeCriteria
} from './filterCriteria';
import {
	collapseCellInputs,
	collapseCellOutputs,
	expandCellInputs,
	expandCellOutputs
} from './collapseCommands';

type NotebookFilterState = {
	criteria: NotebookFilterCriteria;
	/** Indices we collapsed as part of the current filter application. */
	collapsedByFilter: Set<number>;
	matchCount: number;
	totalCount: number;
};

export class NotebookFilterManager {
	private readonly states = new Map<string, NotebookFilterState>();
	private readonly statusBar: vscode.StatusBarItem;
	private applying = false;

	constructor() {
		this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
		this.statusBar.command = 'jupyter-cell-tags.notebookFilter.clear';
	}

	dispose(): void {
		this.statusBar.dispose();
		this.states.clear();
	}

	getCriteria(notebook: vscode.NotebookDocument): NotebookFilterCriteria | undefined {
		return this.states.get(notebook.uri.toString())?.criteria;
	}

	isActive(notebook: vscode.NotebookDocument): boolean {
		return isFilterActive(this.getCriteria(notebook));
	}

	async apply(notebook: vscode.NotebookDocument, criteria: NotebookFilterCriteria): Promise<{ matchCount: number; totalCount: number }> {
		if (!isFilterActive(criteria)) {
			await this.clear(notebook);
			return { matchCount: notebook.cellCount, totalCount: notebook.cellCount };
		}

		this.applying = true;
		try {
			const cells = notebook.getCells();
			const matchIndices: number[] = [];
			const collapseIndices: number[] = [];
			const collapseOutputIndices: number[] = [];
			const expandOutputIndices: number[] = [];

			for (const cell of cells) {
				const matches = cellMatchesFilter(cell, criteria);
				if (matches) {
					matchIndices.push(cell.index);
					if (cellHasOutputs(cell)) {
						expandOutputIndices.push(cell.index);
					}
				} else {
					collapseIndices.push(cell.index);
					if (cellHasOutputs(cell)) {
						collapseOutputIndices.push(cell.index);
					}
				}
			}

			// Expand matches first so focus cells are readable, then collapse the rest.
			await expandCellInputs(notebook.uri, matchIndices);
			await expandCellOutputs(notebook.uri, expandOutputIndices);
			await collapseCellInputs(notebook.uri, collapseIndices);
			await collapseCellOutputs(notebook.uri, collapseOutputIndices);

			const state: NotebookFilterState = {
				criteria,
				collapsedByFilter: new Set(collapseIndices),
				matchCount: matchIndices.length,
				totalCount: cells.length
			};
			this.states.set(notebook.uri.toString(), state);
			await this.syncUi(notebook);
			log(`Notebook filter applied (${summarizeCriteria(criteria)}): ${state.matchCount}/${state.totalCount}`);
			return { matchCount: state.matchCount, totalCount: state.totalCount };
		} finally {
			this.applying = false;
		}
	}

	/** Drop filter state without expanding (e.g. notebook closed). */
	forget(notebook: vscode.NotebookDocument): void {
		this.states.delete(notebook.uri.toString());
	}

	async clear(notebook: vscode.NotebookDocument): Promise<void> {
		const key = notebook.uri.toString();
		const state = this.states.get(key);
		if (!state) {
			await this.syncUi(notebook);
			return;
		}

		this.applying = true;
		try {
			const indices = [...state.collapsedByFilter];
			const outputIndices = indices.filter(i => {
				if (i < 0 || i >= notebook.cellCount) {
					return false;
				}
				return cellHasOutputs(notebook.cellAt(i));
			});
			await expandCellInputs(notebook.uri, indices);
			await expandCellOutputs(notebook.uri, outputIndices);
			this.states.delete(key);
			await this.syncUi(notebook);
			log('Notebook filter cleared');
		} finally {
			this.applying = false;
		}
	}

	async reapply(notebook: vscode.NotebookDocument): Promise<void> {
		if (this.applying) {
			return;
		}
		const criteria = this.getCriteria(notebook);
		if (!criteria || !isFilterActive(criteria)) {
			return;
		}
		await this.apply(notebook, criteria);
	}

	async syncUi(notebook?: vscode.NotebookDocument): Promise<void> {
		const active = notebook ?? vscode.window.activeNotebookEditor?.notebook;
		const activeState = active ? this.states.get(active.uri.toString()) : undefined;
		const isActive = !!activeState && isFilterActive(activeState.criteria);

		await vscode.commands.executeCommand('setContext', 'jupyter-cell-tags.notebookFilter.active', isActive);

		if (isActive && activeState) {
			this.statusBar.text = `$(filter) ${activeState.matchCount}/${activeState.totalCount}`;
			this.statusBar.tooltip = `Notebook filter active — ${summarizeCriteria(activeState.criteria)}\nClick to clear`;
			this.statusBar.show();
		} else {
			this.statusBar.hide();
		}
	}
}
