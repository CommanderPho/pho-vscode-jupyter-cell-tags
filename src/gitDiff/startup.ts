import * as vscode from 'vscode';
import { GitDiffCellHighlighter, pickCommitAndHighlight, highlightVsHead } from './gitDiffProvider';

export function activateGitDiffHighlighting(context: vscode.ExtensionContext): void {
	const highlighter = new GitDiffCellHighlighter();
	highlighter.activate(context);
	context.subscriptions.push({ dispose: () => highlighter.dispose() });

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'jupyter-cell-tags.gitDiff.highlightChangedCells',
			() => pickCommitAndHighlight(highlighter)
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'jupyter-cell-tags.gitDiff.clearHighlights',
			() => highlighter.clearHighlights()
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'jupyter-cell-tags.gitDiff.highlightChangedCellsVsHead',
			() => highlightVsHead(highlighter)
		)
	);
}
