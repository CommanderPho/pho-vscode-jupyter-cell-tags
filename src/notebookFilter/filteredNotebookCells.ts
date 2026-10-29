import * as vscode from 'vscode';
import { getCellTags } from '../helper';
import {
	cellMatchesFilter,
	isFilterActive,
	NotebookFilterCriteria
} from './filterCriteria';
import {
	emptyFilteredSnapshot,
	FilteredCellSnapshot,
	FilteredNotebookSnapshot
} from './filteredCellSnapshot';

export function snapshotCellFromNotebook(cell: vscode.NotebookCell): FilteredCellSnapshot {
	const tags = getCellTags(cell);
	const metadata: Record<string, unknown> = {};
	if (tags.length > 0) {
		metadata.tags = tags;
	}
	const languageId =
		cell.document.languageId ||
		(cell.kind === vscode.NotebookCellKind.Markup ? 'markdown' : 'python');
	if (languageId) {
		metadata.vscode = { languageId };
	}
	return {
		cellType: cell.kind === vscode.NotebookCellKind.Markup ? 'markdown' : 'code',
		source: cell.document.getText(),
		languageId,
		metadata
	};
}

export function copyNotebookMetadata(notebook: vscode.NotebookDocument): Record<string, unknown> {
	const raw = (notebook.metadata ?? {}) as Record<string, unknown>;
	const nested = (raw.metadata ?? raw.custom ?? {}) as Record<string, unknown>;
	const kernelspec = raw.kernelspec ?? nested.kernelspec;
	const language_info = raw.language_info ?? nested.language_info;
	const out: Record<string, unknown> = {};
	if (kernelspec) {
		out.kernelspec = kernelspec;
	}
	if (language_info) {
		out.language_info = language_info;
	}
	return out;
}

export function collectMatchingSnapshots(
	notebook: vscode.NotebookDocument,
	criteria: NotebookFilterCriteria | undefined
): { snapshot: FilteredNotebookSnapshot; matchCount: number; totalCount: number } {
	const totalCount = notebook.cellCount;
	const metadata = copyNotebookMetadata(notebook);
	if (!criteria || !isFilterActive(criteria)) {
		return { snapshot: emptyFilteredSnapshot(metadata), matchCount: 0, totalCount };
	}
	const matched = notebook.getCells().filter(cell => cellMatchesFilter(cell, criteria));
	return {
		snapshot: {
			cells: matched.map(snapshotCellFromNotebook),
			metadata
		},
		matchCount: matched.length,
		totalCount
	};
}

export function snapshotToCellData(snapshot: FilteredNotebookSnapshot): vscode.NotebookCellData[] {
	return snapshot.cells.map(cell => {
		const kind =
			cell.cellType === 'markdown' ? vscode.NotebookCellKind.Markup : vscode.NotebookCellKind.Code;
		const data = new vscode.NotebookCellData(kind, cell.source, cell.languageId);
		data.metadata = cell.metadata;
		data.outputs = [];
		return data;
	});
}

export function snapshotToNotebookData(snapshot: FilteredNotebookSnapshot): vscode.NotebookData {
	const data = new vscode.NotebookData(snapshotToCellData(snapshot));
	data.metadata = snapshot.metadata;
	return data;
}
