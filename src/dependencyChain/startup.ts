import * as vscode from 'vscode';
import { analyzeNotebookSymbols } from './analyzeNotebook';
import { buildDependencyChain } from './buildChain';
import { DependencyChainHighlighter } from './chainHighlighter';
import { ChainHistory, firstLinePreview } from './chainHistory';
import { DependencyChainTreeDataProvider } from './DependencyChainTreeDataProvider';
import { log } from '../util/logging';

export function activateDependencyChain(context: vscode.ExtensionContext): void {
	const history = new ChainHistory();
	const highlighter = new DependencyChainHighlighter();
	highlighter.activate(context);
	const provider = new DependencyChainTreeDataProvider(history);

	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('dependency-chain-view', provider)
	);

	context.subscriptions.push(
		vscode.window.onDidChangeActiveNotebookEditor((editor) => {
			provider.refresh();
			if (!editor) {
				highlighter.clearDecorations();
				return;
			}
			const active = history.getActive(editor.notebook.uri.toString());
			if (active) {
				highlighter.apply(editor.notebook, active);
			} else {
				highlighter.clearDecorations();
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'jupyter-cell-tags.dependencyChain.showDependentCells',
			() => showDependentCells(context.extensionPath, history, highlighter, provider)
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'jupyter-cell-tags.dependencyChain.selectChain',
			async (notebookUri: string, snapshotId: string) => {
				await selectChain(notebookUri, snapshotId, history, highlighter, provider, false);
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'jupyter-cell-tags.dependencyChain.revealCell',
			async (notebookUri: string, snapshotId: string, cellIndex: number) => {
				const editor = await selectChain(
					notebookUri,
					snapshotId,
					history,
					highlighter,
					provider,
					true
				);
				if (!editor || cellIndex < 0 || cellIndex >= editor.notebook.cellCount) {
					return;
				}
				const range = new vscode.NotebookRange(cellIndex, cellIndex + 1);
				await editor.revealRange(range, vscode.NotebookEditorRevealType.InCenter);
				editor.selections = [range];
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'jupyter-cell-tags.dependencyChain.clearHighlights',
			() => {
				const editor = vscode.window.activeNotebookEditor;
				if (editor) {
					history.clearActive(editor.notebook.uri.toString());
				}
				highlighter.clearDecorations();
				provider.refresh();
			}
		)
	);
}

async function showDependentCells(
	extensionPath: string,
	history: ChainHistory,
	highlighter: DependencyChainHighlighter,
	provider: DependencyChainTreeDataProvider
): Promise<void> {
	const editor = vscode.window.activeNotebookEditor;
	if (!editor) {
		vscode.window.showWarningMessage('No active notebook editor.');
		return;
	}

	const cell = selectedSingleCell(editor);
	if (!cell) {
		vscode.window.showWarningMessage('Select a single code cell.');
		return;
	}
	if (cell.kind !== vscode.NotebookCellKind.Code || cell.document.languageId !== 'python') {
		vscode.window.showWarningMessage('Dependency Chain supports Python code cells only.');
		return;
	}

	const targetIndex = cell.index;
	let symbols;
	try {
		symbols = await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Window,
				title: 'Computing dependency chain',
			},
			() => analyzeNotebookSymbols(editor.notebook, targetIndex, extensionPath)
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		log(`[DependencyChain] ${message}`);
		vscode.window.showErrorMessage(`Dependency Chain: ${message}`);
		return;
	}

	if (editor.notebook.isClosed || targetIndex >= editor.notebook.cellCount) {
		vscode.window.showWarningMessage('The notebook changed before the dependency chain finished.');
		return;
	}

	const chain = buildDependencyChain(symbols, targetIndex);
	const preview = firstLinePreview(editor.notebook.cellAt(targetIndex).document.getText());
	const snapshot = history.push(editor.notebook.uri.toString(), targetIndex, preview, chain);
	highlighter.apply(editor.notebook, snapshot);
	provider.refresh();

	const count = chain.hops.length;
	vscode.window.setStatusBarMessage(
		`Dependency Chain: ${count} prerequisite cell${count === 1 ? '' : 's'}`,
		4000
	);

	await vscode.commands.executeCommand('workbench.view.explorer');
	await vscode.commands.executeCommand('dependency-chain-view.focus');
}

async function selectChain(
	notebookUri: string,
	snapshotId: string,
	history: ChainHistory,
	highlighter: DependencyChainHighlighter,
	provider: DependencyChainTreeDataProvider,
	revealNotebook: boolean
): Promise<vscode.NotebookEditor | undefined> {
	const snapshot = history.activate(notebookUri, snapshotId);
	if (!snapshot) {
		return undefined;
	}
	const editor = await openNotebook(notebookUri, revealNotebook);
	if (editor) {
		highlighter.apply(editor.notebook, snapshot);
	}
	provider.refresh();
	return editor;
}

function selectedSingleCell(editor: vscode.NotebookEditor): vscode.NotebookCell | undefined {
	if (editor.selections.length !== 1) {
		return undefined;
	}
	const range = editor.selections[0];
	if (range.end - range.start !== 1) {
		return undefined;
	}
	if (range.start < 0 || range.start >= editor.notebook.cellCount) {
		return undefined;
	}
	return editor.notebook.cellAt(range.start);
}

async function openNotebook(
	notebookUri: string,
	force: boolean
): Promise<vscode.NotebookEditor | undefined> {
	const active = vscode.window.activeNotebookEditor;
	if (active && active.notebook.uri.toString() === notebookUri) {
		return active;
	}
	if (!force) {
		return undefined;
	}
	const document = vscode.workspace.notebookDocuments.find(
		(notebook) => notebook.uri.toString() === notebookUri
	);
	if (!document) {
		vscode.window.showWarningMessage('The notebook for this dependency chain is no longer open.');
		return undefined;
	}
	return vscode.window.showNotebookDocument(document);
}
