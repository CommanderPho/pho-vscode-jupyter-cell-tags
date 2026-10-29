import * as vscode from 'vscode';

export const FILTERED_NOTEBOOK_SCHEME = 'pho-filtered';

export function isFilteredNotebookUri(uri: vscode.Uri | undefined): boolean {
	return uri?.scheme === FILTERED_NOTEBOOK_SCHEME;
}

export function isFilteredNotebook(notebook: vscode.NotebookDocument | undefined): boolean {
	return isFilteredNotebookUri(notebook?.uri);
}

export function filteredNotebookUri(sessionId: string, fileName: string): vscode.Uri {
	const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_') || 'filtered.ipynb';
	const withExt = safe.toLowerCase().endsWith('.ipynb') ? safe : `${safe}.ipynb`;
	return vscode.Uri.from({
		scheme: FILTERED_NOTEBOOK_SCHEME,
		path: `/${sessionId}/${withExt}`
	});
}
