import * as vscode from 'vscode';

/** Same orange as cellVisualHighlight overview ruler. */
export const FILTER_ACCENT = 'rgba(255, 165, 0, 0.85)';
/** Solid hex for webview CSS (same hue). */
export const FILTER_ACCENT_CSS = '#ffa500';

/**
 * Orange overview-ruler marks for cells matching the active notebook filter.
 */
export class FilterScrollbarDecorators implements vscode.Disposable {
	private decorationType: vscode.TextEditorDecorationType;
	private matchedIndices: number[] = [];
	private notebook: vscode.NotebookDocument | undefined;
	private readonly disposables: vscode.Disposable[] = [];
	private scrollTimeout: NodeJS.Timeout | undefined;

	constructor() {
		this.decorationType = this.createDecorationType();
		this.disposables.push(
			vscode.window.onDidChangeVisibleTextEditors(() => {
				if (!this.notebook || this.matchedIndices.length === 0) {
					return;
				}
				if (this.scrollTimeout) {
					clearTimeout(this.scrollTimeout);
				}
				this.scrollTimeout = setTimeout(() => {
					this.scrollTimeout = undefined;
					this.applyToVisibleEditors();
				}, 100);
			}),
			{
				dispose: () => {
					if (this.scrollTimeout) {
						clearTimeout(this.scrollTimeout);
						this.scrollTimeout = undefined;
					}
				}
			}
		);
	}

	private createDecorationType(): vscode.TextEditorDecorationType {
		return vscode.window.createTextEditorDecorationType({
			overviewRulerColor: FILTER_ACCENT,
			overviewRulerLane: vscode.OverviewRulerLane.Right
		});
	}

	/**
	 * Show orange scrollbar ticks for the given match indices on the notebook.
	 */
	update(notebook: vscode.NotebookDocument, matchedIndices: number[]): void {
		this.clearFromVisibleEditors();
		this.notebook = notebook;
		this.matchedIndices = matchedIndices.slice();
		this.applyToVisibleEditors();
	}

	clear(): void {
		this.clearFromVisibleEditors();
		this.notebook = undefined;
		this.matchedIndices = [];
	}

	dispose(): void {
		this.clear();
		this.decorationType.dispose();
		this.disposables.forEach(d => d.dispose());
	}

	private applyToVisibleEditors(): void {
		if (!this.notebook || this.matchedIndices.length === 0) {
			return;
		}

		const notebook = this.notebook;
		const matchUriSet = new Set<string>();
		for (const index of this.matchedIndices) {
			if (index < 0 || index >= notebook.cellCount) {
				continue;
			}
			matchUriSet.add(notebook.cellAt(index).document.uri.toString());
		}

		for (const editor of vscode.window.visibleTextEditors) {
			const uri = editor.document.uri.toString();
			if (!matchUriSet.has(uri)) {
				editor.setDecorations(this.decorationType, []);
				continue;
			}
			editor.setDecorations(this.decorationType, [this.getCellFullRange(editor.document)]);
		}
	}

	private clearFromVisibleEditors(): void {
		for (const editor of vscode.window.visibleTextEditors) {
			editor.setDecorations(this.decorationType, []);
		}
	}

	private getCellFullRange(document: vscode.TextDocument): vscode.Range {
		if (document.lineCount === 0) {
			return new vscode.Range(0, 0, 0, 0);
		}
		const lastLine = document.lineCount - 1;
		return new vscode.Range(0, 0, lastLine, document.lineAt(lastLine).text.length);
	}
}
