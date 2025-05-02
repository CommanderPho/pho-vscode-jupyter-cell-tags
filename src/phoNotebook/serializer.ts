import * as vscode from 'vscode';
import { TextDecoder, TextEncoder } from 'util';

interface RawNotebook {
	cells: RawNotebookCell[];
}

interface RawNotebookCell {
	source: string[];
	cell_type: 'code' | 'markdown';
}

export class PhoNotebookCustomSerializer implements vscode.NotebookSerializer {
	async deserializeNotebook(content: Uint8Array, _token: vscode.CancellationToken): Promise<vscode.NotebookData> {
		var contents = new TextDecoder().decode(content);

		let raw: RawNotebookCell[];
		try {
		raw = (<RawNotebook>JSON.parse(contents)).cells;
		} catch {
		raw = [];
		}

		const cells = raw.map(
		item =>
			new vscode.NotebookCellData(
				item.cell_type === 'code'
					? vscode.NotebookCellKind.Code
					: vscode.NotebookCellKind.Markup,
				// Simply concatenate the source array
				item.source.join(''),
				item.cell_type === 'code' ? 'python' : 'markdown'
				)
		);

		return new vscode.NotebookData(cells);
	}

	async serializeNotebook(data: vscode.NotebookData, _token: vscode.CancellationToken): Promise<Uint8Array> {
		let contents: RawNotebookCell[] = [];

	for (const cell of data.cells) {
	contents.push({
		cell_type: cell.kind === vscode.NotebookCellKind.Code ? 'code' : 'markdown',
		// Store the entire cell content as a single string in the array
		source: [cell.value]
	});
	}
	  
		return new TextEncoder().encode(JSON.stringify(contents));
	}
}