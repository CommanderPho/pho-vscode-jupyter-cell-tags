/**
 * Plain DTOs and nbformat serialization for a filtered notebook copy.
 * Kept free of the `vscode` module so unit tests can run in plain Node.
 */

export type FilteredCellSnapshot = {
	cellType: 'code' | 'markdown';
	source: string;
	languageId: string;
	metadata: Record<string, unknown>;
};

export type FilteredNotebookSnapshot = {
	cells: FilteredCellSnapshot[];
	metadata: Record<string, unknown>;
};

export function emptyFilteredSnapshot(
	metadata: Record<string, unknown> = {}
): FilteredNotebookSnapshot {
	return { cells: [], metadata };
}

/** Split source into nbformat line arrays (newline kept on every line except the last). */
export function splitNbformatSource(source: string): string[] {
	if (source.length === 0) {
		return [];
	}
	const parts = source.split('\n');
	return parts.map((line, index) => (index === parts.length - 1 ? line : `${line}\n`));
}

export function snapshotToNbformat(snapshot: FilteredNotebookSnapshot): {
	nbformat: 4;
	nbformat_minor: 5;
	metadata: Record<string, unknown>;
	cells: Record<string, unknown>[];
} {
	const cells = snapshot.cells.map(cell => {
		const nbCell: Record<string, unknown> = {
			cell_type: cell.cellType,
			metadata: cell.metadata ?? {},
			source: splitNbformatSource(cell.source)
		};
		if (cell.cellType === 'code') {
			nbCell.outputs = [];
			nbCell.execution_count = null;
		}
		return nbCell;
	});
	return {
		nbformat: 4,
		nbformat_minor: 5,
		metadata: snapshot.metadata ?? {},
		cells
	};
}

export function snapshotToNbformatJson(snapshot: FilteredNotebookSnapshot): string {
	return JSON.stringify(snapshotToNbformat(snapshot), null, 2);
}

export function snapshotToNbformatBytes(snapshot: FilteredNotebookSnapshot): Uint8Array {
	return new TextEncoder().encode(snapshotToNbformatJson(snapshot));
}
