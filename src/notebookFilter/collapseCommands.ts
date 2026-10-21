import * as vscode from 'vscode';

export type CellRangeArg = { start: number; end: number };

/** Merge sorted unique indices into contiguous half-open ranges. */
export function indicesToRanges(indices: number[]): CellRangeArg[] {
	if (indices.length === 0) {
		return [];
	}
	const sorted = [...new Set(indices)].sort((a, b) => a - b);
	const ranges: CellRangeArg[] = [];
	let start = sorted[0];
	let prev = sorted[0];
	for (let i = 1; i < sorted.length; i++) {
		const idx = sorted[i];
		if (idx === prev + 1) {
			prev = idx;
			continue;
		}
		ranges.push({ start, end: prev + 1 });
		start = idx;
		prev = idx;
	}
	ranges.push({ start, end: prev + 1 });
	return ranges;
}

async function runOnRanges(
	command: string,
	document: vscode.Uri,
	indices: number[]
): Promise<void> {
	const ranges = indicesToRanges(indices);
	if (ranges.length === 0) {
		return;
	}
	await vscode.commands.executeCommand(command, { document, ranges });
}

export async function collapseCellInputs(document: vscode.Uri, indices: number[]): Promise<void> {
	await runOnRanges('notebook.cell.collapseCellInput', document, indices);
}

export async function expandCellInputs(document: vscode.Uri, indices: number[]): Promise<void> {
	await runOnRanges('notebook.cell.expandCellInput', document, indices);
}

export async function collapseCellOutputs(document: vscode.Uri, indices: number[]): Promise<void> {
	await runOnRanges('notebook.cell.collapseCellOutput', document, indices);
}

export async function expandCellOutputs(document: vscode.Uri, indices: number[]): Promise<void> {
	await runOnRanges('notebook.cell.expandCellOutput', document, indices);
}
