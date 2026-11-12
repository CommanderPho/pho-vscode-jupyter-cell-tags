import * as vscode from 'vscode';
import type { Jupyter, Kernel } from '@vscode/jupyter-extension';
import {
	findNotebookEditor,
	getActiveCell,
	getActiveCells,
} from '../util/notebookSelection';

const ErrorMimeType = vscode.NotebookCellOutputItem.error(new Error('')).mime;
const StdOutMimeType = vscode.NotebookCellOutputItem.stdout('').mime;
const StdErrMimeType = vscode.NotebookCellOutputItem.stderr('').mime;
const textDecoder = new TextDecoder();

export type KernelTextOutput = {
	mime: string;
	text: string;
	isError?: boolean;
};

export type LiveConsoleStatus = {
	notebookUri?: string;
	notebookName?: string;
	cellIndex?: number;
	kernelAvailable: boolean;
};

export type LiveConsoleApi = {
	getActiveNotebook(): vscode.NotebookDocument | undefined;
	getActiveCell(): vscode.NotebookCell | undefined;
	getActiveCells(): vscode.NotebookCell[] | undefined;
	findNotebookEditor(uri?: vscode.Uri): vscode.NotebookEditor | undefined;
	getKernel(): Promise<Kernel | undefined>;
	executeOnKernel(code: string, token?: vscode.CancellationToken): Promise<KernelTextOutput[]>;
	describeStatus(): Promise<LiveConsoleStatus>;
};

async function getJupyterApi(): Promise<Jupyter | undefined> {
	const ext = vscode.extensions.getExtension<Jupyter>('ms-toolsai.jupyter');
	if (!ext) {
		return undefined;
	}
	if (!ext.isActive) {
		await ext.activate();
	}
	return ext.exports;
}

export async function getKernelForActiveNotebook(): Promise<Kernel | undefined> {
	const editor = vscode.window.activeNotebookEditor;
	if (!editor) {
		return undefined;
	}
	const api = await getJupyterApi();
	if (!api) {
		return undefined;
	}
	return api.kernels.getKernel(editor.notebook.uri);
}

export async function executeOnKernel(
	code: string,
	token?: vscode.CancellationToken
): Promise<KernelTextOutput[]> {
	const kernel = await getKernelForActiveNotebook();
	if (!kernel) {
		throw new Error('No kernel for the active notebook. Open a notebook and select/start a kernel.');
	}

	const ownToken = token ? undefined : new vscode.CancellationTokenSource();
	const effectiveToken = token ?? ownToken!.token;
	const results: KernelTextOutput[] = [];

	try {
		for await (const output of kernel.executeCode(code, effectiveToken)) {
			for (const outputItem of output.items) {
				const text = textDecoder.decode(outputItem.data);
				if (outputItem.mime === ErrorMimeType) {
					try {
						const error = JSON.parse(text) as { name?: string; message?: string; stack?: string };
						results.push({
							mime: outputItem.mime,
							text: `${error.name ?? 'Error'}: ${error.message ?? text}${error.stack ? `\n${error.stack}` : ''}`,
							isError: true,
						});
					} catch {
						results.push({ mime: outputItem.mime, text, isError: true });
					}
				} else if (
					outputItem.mime === StdOutMimeType ||
					outputItem.mime === StdErrMimeType ||
					outputItem.mime.startsWith('text/')
				) {
					results.push({
						mime: outputItem.mime,
						text,
						isError: outputItem.mime === StdErrMimeType,
					});
				} else {
					results.push({ mime: outputItem.mime, text });
				}
			}
		}
	} finally {
		ownToken?.dispose();
	}

	return results;
}

export function createLiveConsoleApi(): LiveConsoleApi {
	return {
		getActiveNotebook(): vscode.NotebookDocument | undefined {
			return vscode.window.activeNotebookEditor?.notebook;
		},
		getActiveCell,
		getActiveCells,
		findNotebookEditor,
		getKernel: getKernelForActiveNotebook,
		executeOnKernel,
		async describeStatus(): Promise<LiveConsoleStatus> {
			const editor = vscode.window.activeNotebookEditor;
			const cell = getActiveCell();
			let kernelAvailable = false;
			if (editor) {
				try {
					kernelAvailable = !!(await getKernelForActiveNotebook());
				} catch {
					kernelAvailable = false;
				}
			}
			return {
				notebookUri: editor?.notebook.uri.toString(),
				notebookName: editor ? vscode.workspace.asRelativePath(editor.notebook.uri) : undefined,
				cellIndex: cell?.index,
				kernelAvailable,
			};
		},
	};
}
