import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { CellSymbolInfo, emptySymbols } from './buildChain';

interface RawCell {
	defines?: unknown;
	uses?: unknown;
	mutations?: unknown;
	parseError?: unknown;
	starImport?: unknown;
	dynamicExec?: unknown;
}

export function resolvePythonExecutable(): string {
	const configured = vscode.workspace
		.getConfiguration('jupyter-cell-tags')
		.get<string>('jupyterEnhancements.kernel.pythonPath', '');
	if (configured && fs.existsSync(configured)) {
		return configured;
	}
	return 'python';
}

export function findAnalyzerScript(extensionPath: string): string {
	const candidates = [
		path.join(extensionPath, 'src', 'dependencyChain', 'analyzeSymbols.py'),
		path.join(extensionPath, 'out', 'dependencyChain', 'analyzeSymbols.py'),
	];
	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}
	throw new Error('Could not find analyzeSymbols.py in the extension.');
}

/**
 * Symbol info for cells 0..targetIndex. Non-Python cells are empty.
 * Throws if Python cannot be run; callers should leave highlights unchanged.
 */
export async function analyzeNotebookSymbols(
	notebook: vscode.NotebookDocument,
	targetIndex: number,
	extensionPath: string
): Promise<CellSymbolInfo[]> {
	const last = Math.min(targetIndex, notebook.cellCount - 1);
	const symbols: CellSymbolInfo[] = [];
	const sources: string[] = [];
	const indexes: number[] = [];

	for (let i = 0; i <= last; i++) {
		const cell = notebook.cellAt(i);
		symbols.push(emptySymbols());
		if (
			cell.kind === vscode.NotebookCellKind.Code &&
			cell.document.languageId === 'python'
		) {
			sources.push(cell.document.getText());
			indexes.push(i);
		}
	}

	if (sources.length === 0) {
		return symbols;
	}

	const analyzed = await runAnalyzer(sources, extensionPath);
	if (analyzed.length !== sources.length) {
		throw new Error('Symbol analysis returned an unexpected number of cells.');
	}
	for (let k = 0; k < indexes.length; k++) {
		symbols[indexes[k]] = normalizeCell(analyzed[k]);
	}
	return symbols;
}

function runAnalyzer(sources: string[], extensionPath: string): Promise<RawCell[]> {
	const python = resolvePythonExecutable();
	const script = findAnalyzerScript(extensionPath);
	const payload = JSON.stringify({ cells: sources });

	return new Promise((resolve, reject) => {
		const child = execFile(
			python,
			[script],
			{ maxBuffer: 32 * 1024 * 1024, windowsHide: true },
			(err, stdout, stderr) => {
				if (err) {
					const detail = (stderr || err.message || '').trim();
					reject(
						new Error(
							`Could not analyze cell symbols with Python (${python}). ${detail} Set jupyter-cell-tags.jupyterEnhancements.kernel.pythonPath if Python is not on PATH.`
						)
					);
					return;
				}
				try {
					const parsed = JSON.parse(stdout) as { cells?: RawCell[] };
					if (!parsed.cells) {
						reject(new Error('Symbol analysis returned no cells.'));
						return;
					}
					resolve(parsed.cells);
				} catch {
					reject(new Error('Symbol analysis returned invalid JSON.'));
				}
			}
		);
		child.stdin?.end(payload, 'utf8');
	});
}

function normalizeCell(raw: RawCell | undefined): CellSymbolInfo {
	return {
		defines: stringList(raw?.defines),
		uses: stringList(raw?.uses),
		mutations: stringList(raw?.mutations),
		parseError: raw?.parseError === true,
		starImport: raw?.starImport === true,
		dynamicExec: raw?.dynamicExec === true,
	};
}

function stringList(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter((item): item is string => typeof item === 'string');
}
