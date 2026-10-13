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
import { FilterScrollbarDecorators } from './filterDecorators';

type NotebookFilterState = {
	criteria: NotebookFilterCriteria;
	/** Indices we collapsed as part of the current filter application. */
	collapsedByFilter: Set<number>;
	/** Indices that matched the filter (for scrollbar decorations). */
	matchedByFilter: Set<number>;
	matchCount: number;
	totalCount: number;
};

export class NotebookFilterManager {
	private readonly states = new Map<string, NotebookFilterState>();
	private readonly statusBar: vscode.StatusBarItem;
	private readonly decorators = new FilterScrollbarDecorators();
	private applying = false;
	/** Ignore reapply triggers briefly after apply/clear to absorb collapse metadata events. */
	private settleUntil = 0;
	private static readonly SETTLE_MS = 400;

	isApplying(): boolean {
		return this.applying;
	}

	isSettling(): boolean {
		return Date.now() < this.settleUntil;
	}

	private beginSettle(): void {
		this.settleUntil = Date.now() + NotebookFilterManager.SETTLE_MS;
	}

	constructor() {
		this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
		this.statusBar.command = 'jupyter-cell-tags.notebookFilter.clear';
	}

	dispose(): void {
		void this.clearAll().finally(() => {
			this.decorators.dispose();
			this.statusBar.dispose();
		});
	}

	/**
	 * Expand filter-collapsed cells for every tracked notebook that is still open,
	 * then drop any leftover state. Used on extension/module teardown.
	 */
	async clearAll(): Promise<void> {
		const openByKey = new Map(
			vscode.workspace.notebookDocuments.map(n => [n.uri.toString(), n] as const)
		);
		const keys = [...this.states.keys()];
		for (const key of keys) {
			const notebook = openByKey.get(key);
			if (notebook) {
				await this.clear(notebook);
			} else {
				this.states.delete(key);
			}
		}
		this.decorators.clear();
	}

	getCriteria(notebook: vscode.NotebookDocument): NotebookFilterCriteria | undefined {
		return this.states.get(notebook.uri.toString())?.criteria;
	}

	isActive(notebook: vscode.NotebookDocument): boolean {
		return isFilterActive(this.getCriteria(notebook));
	}

	getMatchedIndices(notebook: vscode.NotebookDocument): number[] {
		const state = this.states.get(notebook.uri.toString());
		return state ? [...state.matchedByFilter].sort((a, b) => a - b) : [];
	}

	/** Snapshot for sidebar webview sync. */
	getUiSnapshot(notebook?: vscode.NotebookDocument): {
		criteria: NotebookFilterCriteria;
		matchCount?: number;
		totalCount?: number;
		filterActive: boolean;
	} {
		const active = notebook ?? vscode.window.activeNotebookEditor?.notebook;
		const state = active ? this.states.get(active.uri.toString()) : undefined;
		const criteria = state?.criteria ?? {};
		return {
			criteria,
			matchCount: state?.matchCount,
			totalCount: state?.totalCount,
			filterActive: !!state && isFilterActive(state.criteria)
		};
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
				matchedByFilter: new Set(matchIndices),
				matchCount: matchIndices.length,
				totalCount: cells.length
			};
			this.states.set(notebook.uri.toString(), state);
			await this.syncUi(notebook);
			log(`Notebook filter applied (${summarizeCriteria(criteria)}): ${state.matchCount}/${state.totalCount}`);
			return { matchCount: state.matchCount, totalCount: state.totalCount };
		} finally {
			this.applying = false;
			this.beginSettle();
		}
	}

	/** Drop filter state without expanding when expand is impossible or after clear. */
	forget(notebook: vscode.NotebookDocument): void {
		this.states.delete(notebook.uri.toString());
		const active = vscode.window.activeNotebookEditor?.notebook;
		if (!active || active.uri.toString() === notebook.uri.toString()) {
			this.decorators.clear();
		}
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
			this.beginSettle();
		}
	}

	async reapply(notebook: vscode.NotebookDocument): Promise<void> {
		if (this.applying || this.isSettling()) {
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

		if (isActive && activeState && active) {
			this.statusBar.text = `$(filter) ${activeState.matchCount}/${activeState.totalCount}`;
			this.statusBar.tooltip = `Notebook filter active — ${summarizeCriteria(activeState.criteria)}\nClick to clear`;
			this.statusBar.show();
			this.decorators.update(active, [...activeState.matchedByFilter]);
		} else {
			this.statusBar.hide();
			this.decorators.clear();
		}
	}
}
