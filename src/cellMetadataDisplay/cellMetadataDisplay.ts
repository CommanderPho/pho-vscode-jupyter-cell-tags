import * as vscode from 'vscode';
import { getActiveCell } from '../util/notebookSelection';
import { log } from '../util/logging';

let metadataPanel: vscode.WebviewPanel | undefined = undefined;
let selectionChangeListener: vscode.Disposable | undefined = undefined;
let editorChangeListener: vscode.Disposable | undefined = undefined;

function formatCellMetadata(cell: vscode.NotebookCell | undefined): string {
	if (!cell) {
		return JSON.stringify({ message: 'No cell selected' }, null, 2);
	}

	const metadata = {
		cellIndex: cell.index,
		cellKind: cell.kind === vscode.NotebookCellKind.Code ? 'code' : cell.kind === vscode.NotebookCellKind.Markup ? 'markup' : 'unknown',
		language: cell.document.languageId,
		metadata: cell.metadata,
		outputsCount: cell.outputs.length,
		executionSummary: cell.executionSummary
	};

	return JSON.stringify(metadata, null, 2);
}

function getWebviewContent(metadataJson: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cell Metadata</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
        }
        pre {
            background-color: var(--vscode-textBlockQuote-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 16px;
            overflow-x: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        code {
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
        }
        .header {
            margin-bottom: 16px;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
        }
    </style>
</head>
<body>
    <div class="header">Cell Metadata (Auto-updates on cell selection change)</div>
    <pre><code>${escapeHtml(metadataJson)}</code></pre>
</body>
</html>`;
}

function escapeHtml(text: string): string {
	const map: { [key: string]: string } = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#039;'
	};
	return text.replace(/[&<>"']/g, (m) => map[m]);
}

function updateWebviewContent() {
	if (!metadataPanel) {
		return;
	}

	const activeCell = getActiveCell();
	const metadataJson = formatCellMetadata(activeCell);
	metadataPanel.webview.html = getWebviewContent(metadataJson);
}

function createMetadataPanel(context: vscode.ExtensionContext): vscode.WebviewPanel {
	const panel = vscode.window.createWebviewPanel(
		'cellMetadataDisplay',
		'Cell Metadata',
		vscode.ViewColumn.Beside,
		{
			enableScripts: false,
			retainContextWhenHidden: true
		}
	);

	updateWebviewContent();

	panel.onDidDispose(() => {
		metadataPanel = undefined;
		cleanupListeners();
	}, null, context.subscriptions);

	return panel;
}

function cleanupListeners() {
	if (selectionChangeListener) {
		selectionChangeListener.dispose();
		selectionChangeListener = undefined;
	}
	if (editorChangeListener) {
		editorChangeListener.dispose();
		editorChangeListener = undefined;
	}
}

function toggleMetadataDisplay(context: vscode.ExtensionContext) {
	if (metadataPanel) {
		metadataPanel.dispose();
		metadataPanel = undefined;
		cleanupListeners();
		log('Cell metadata display closed');
	} else {
		metadataPanel = createMetadataPanel(context);
		
		if (!selectionChangeListener) {
			selectionChangeListener = vscode.window.onDidChangeNotebookEditorSelection(() => {
				updateWebviewContent();
			});
			context.subscriptions.push(selectionChangeListener);
		}
		
		if (!editorChangeListener) {
			editorChangeListener = vscode.window.onDidChangeActiveNotebookEditor(() => {
				updateWebviewContent();
			});
			context.subscriptions.push(editorChangeListener);
		}
		
		log('Cell metadata display opened');
	}
}

export function registerCellMetadataDisplay(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('jupyter-cell-tags.toggleCellMetadataDisplay', () => toggleMetadataDisplay(context))
	);
}
