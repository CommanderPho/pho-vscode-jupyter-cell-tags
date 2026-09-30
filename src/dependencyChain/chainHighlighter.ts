import * as vscode from 'vscode';
import { ChainSnapshot } from './chainHistory';

export interface HopAppearance {
	backgroundColor: string;
	numberColor: string;
	rulerColor: string;
}

/** Hop 1 is the strongest orange. Each further hop fades by about 0.72, with a floor. */
export function hopAppearance(hop: number): HopAppearance {
	const bgAlpha = Math.max(0.12, 0.45 * Math.pow(0.72, hop - 1));
	const numberAlpha = Math.max(0.55, 1 - (hop - 1) * 0.1);
	return {
		backgroundColor: `rgba(255, 140, 0, ${bgAlpha.toFixed(3)})`,
		numberColor: `rgba(255, 90, 0, ${Math.min(1, numberAlpha).toFixed(3)})`,
		rulerColor: `rgba(255, 140, 0, ${Math.min(1, bgAlpha + 0.4).toFixed(3)})`,
	};
}

/**
 * Paints the active chain on visible notebook cell editors.
 * The hop number is its own decoration so it appears once, on the first line.
 */
export class DependencyChainHighlighter {
	private backgroundByHop = new Map<number, vscode.TextEditorDecorationType>();
	private badgeByHop = new Map<number, vscode.TextEditorDecorationType>();
	private cellHops = new Map<string, number>();

	activate(context: vscode.ExtensionContext): void {
		context.subscriptions.push(
			vscode.window.onDidChangeVisibleTextEditors((editors) => {
				for (const editor of editors) {
					this.restoreEditor(editor);
				}
			})
		);
		context.subscriptions.push({ dispose: () => this.clearDecorations() });
	}

	apply(notebook: vscode.NotebookDocument, snapshot: ChainSnapshot): void {
		this.clearDecorations();

		const hops = new Set(snapshot.chain.hops.map((entry) => entry.hop));
		for (const hop of hops) {
			const style = hopAppearance(hop);
			this.backgroundByHop.set(
				hop,
				vscode.window.createTextEditorDecorationType({
					backgroundColor: style.backgroundColor,
					isWholeLine: true,
					overviewRulerColor: style.rulerColor,
					overviewRulerLane: vscode.OverviewRulerLane.Left,
					borderWidth: '0 0 0 3px',
					borderStyle: 'solid',
					borderColor: style.rulerColor,
				})
			);
			this.badgeByHop.set(
				hop,
				vscode.window.createTextEditorDecorationType({
					before: {
						contentText: `${hop}`,
						color: style.numberColor,
						fontWeight: 'bold',
						margin: '0 8px 0 0',
					},
				})
			);
		}

		for (const entry of snapshot.chain.hops) {
			if (entry.cellIndex < 0 || entry.cellIndex >= notebook.cellCount) {
				continue;
			}
			const uri = notebook.cellAt(entry.cellIndex).document.uri.toString();
			this.cellHops.set(uri, entry.hop);
		}

		this.restoreAll();
	}

	clearDecorations(): void {
		this.paintEmpty();
		this.cellHops.clear();
		for (const decoration of this.backgroundByHop.values()) {
			decoration.dispose();
		}
		for (const decoration of this.badgeByHop.values()) {
			decoration.dispose();
		}
		this.backgroundByHop.clear();
		this.badgeByHop.clear();
	}

	private restoreAll(): void {
		for (const editor of vscode.window.visibleTextEditors) {
			this.restoreEditor(editor);
		}
	}

	private restoreEditor(editor: vscode.TextEditor): void {
		if (editor.document.uri.scheme !== 'vscode-notebook-cell') {
			return;
		}
		const hop = this.cellHops.get(editor.document.uri.toString());
		const full = fullRange(editor.document);
		const badgeRange = new vscode.Range(0, 0, 0, 0);

		for (const [level, decoration] of this.backgroundByHop) {
			editor.setDecorations(decoration, level === hop ? [full] : []);
		}
		for (const [level, decoration] of this.badgeByHop) {
			editor.setDecorations(decoration, level === hop ? [badgeRange] : []);
		}
	}

	private paintEmpty(): void {
		for (const editor of vscode.window.visibleTextEditors) {
			if (editor.document.uri.scheme !== 'vscode-notebook-cell') {
				continue;
			}
			for (const decoration of this.backgroundByHop.values()) {
				editor.setDecorations(decoration, []);
			}
			for (const decoration of this.badgeByHop.values()) {
				editor.setDecorations(decoration, []);
			}
		}
	}
}

function fullRange(document: vscode.TextDocument): vscode.Range {
	if (document.lineCount === 0) {
		return new vscode.Range(0, 0, 0, 0);
	}
	const lastLine = document.lineCount - 1;
	return new vscode.Range(0, 0, lastLine, document.lineAt(lastLine).text.length);
}
