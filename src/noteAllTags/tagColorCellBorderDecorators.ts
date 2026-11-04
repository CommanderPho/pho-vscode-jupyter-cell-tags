import * as vscode from 'vscode';
import { getCellTags } from '../helper';
import { TagPropertiesManager } from '../tagProperties/tagPropertiesManager';
import { isFeatureEnabled } from '../util/featureFlags';
import { log } from '../util/logging';
import {
	boxLineRoles,
	planTagColorBorders,
	TAG_COLOR_CELL_BORDER_WIDTH,
} from './tagColorCellBorders';

type BorderKind = 'boxSingle' | 'boxFirst' | 'boxMiddle' | 'boxLast' | 'extraStripe';

/**
 * Thin colored borders on notebook cell editors from manual tag colors.
 * Hot-path listeners are registered only while the feature is enabled.
 */
export class TagColorCellBorderDecoratorManager implements vscode.Disposable {
	private static readonly UPDATE_DEBOUNCE_MS = 200;

	private decorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();
	private currentNotebook: vscode.NotebookDocument | undefined;
	private isEnabled: boolean = false;
	private readonly configDisposables: vscode.Disposable[] = [];
	private hotDisposables: vscode.Disposable[] = [];
	private updateTimer: ReturnType<typeof setTimeout> | undefined;
	private disposed = false;

	constructor(_context: vscode.ExtensionContext) {
		this.configDisposables.push(
			vscode.workspace.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration('jupyter-cell-tags.features.tagColorCellBorders')) {
					this.syncEnabledState();
				}
			})
		);
		this.syncEnabledState();
	}

	public scheduleUpdate(): void {
		this.scheduleUpdateAllDecorations();
	}

	private syncEnabledState(): void {
		if (this.disposed) {
			return;
		}
		const wantEnabled = isFeatureEnabled('tagColorCellBorders');
		if (wantEnabled === this.isEnabled && (wantEnabled ? this.hotDisposables.length > 0 : this.hotDisposables.length === 0)) {
			return;
		}

		if (wantEnabled) {
			this.isEnabled = true;
			this.attachHotListeners();
			if (vscode.window.activeNotebookEditor?.notebook.notebookType === 'jupyter-notebook') {
				this.currentNotebook = vscode.window.activeNotebookEditor.notebook;
			}
			this.scheduleUpdateAllDecorations();
			log('Tag color cell borders enabled');
		} else {
			this.isEnabled = false;
			this.detachHotListeners();
			this.clearAllDecorations();
			this.currentNotebook = undefined;
			log('Tag color cell borders disabled (hot listeners disposed)');
		}
	}

	private attachHotListeners(): void {
		this.detachHotListeners();
		this.hotDisposables.push(
			vscode.window.onDidChangeActiveNotebookEditor(editor => {
				if (editor && editor.notebook.notebookType === 'jupyter-notebook') {
					this.currentNotebook = editor.notebook;
					this.scheduleUpdateAllDecorations();
				} else {
					this.currentNotebook = undefined;
					this.clearAllDecorations();
				}
			}),
			vscode.workspace.onDidChangeNotebookDocument(e => {
				if (!this.currentNotebook || e.notebook.uri.toString() !== this.currentNotebook.uri.toString()) {
					return;
				}
				if (!notebookChangeMayAffectTagBorders(e)) {
					return;
				}
				this.scheduleUpdateAllDecorations();
			}),
			vscode.window.onDidChangeVisibleTextEditors(() => {
				this.scheduleUpdateAllDecorations();
			})
		);
	}

	private detachHotListeners(): void {
		if (this.updateTimer) {
			clearTimeout(this.updateTimer);
			this.updateTimer = undefined;
		}
		this.hotDisposables.forEach(d => d.dispose());
		this.hotDisposables = [];
	}

	private scheduleUpdateAllDecorations(): void {
		if (!this.isEnabled) {
			return;
		}
		if (this.updateTimer) {
			clearTimeout(this.updateTimer);
		}
		this.updateTimer = setTimeout(() => {
			this.updateTimer = undefined;
			this.updateAllDecorations();
		}, TagColorCellBorderDecoratorManager.UPDATE_DEBOUNCE_MS);
	}

	private typeKey(kind: BorderKind, tag: string, color: string): string {
		return `${kind}\0${tag}\0${color}`;
	}

	private getOrCreateDecorationType(kind: BorderKind, tag: string, color: string): vscode.TextEditorDecorationType {
		const key = this.typeKey(kind, tag, color);
		const existing = this.decorationTypes.get(key);
		if (existing) {
			return existing;
		}
		const decorationType = createDecorationType(kind, color);
		this.decorationTypes.set(key, decorationType);
		return decorationType;
	}

	private updateAllDecorations(): void {
		if (!this.isEnabled || !this.currentNotebook) {
			return;
		}

		const notebook = this.currentNotebook;
		const uriToEditor = new Map<string, vscode.TextEditor>();
		for (const editor of vscode.window.visibleTextEditors) {
			if (editor.document.uri.scheme !== 'vscode-notebook-cell') {
				continue;
			}
			uriToEditor.set(editor.document.uri.toString(), editor);
		}

		const allProps = TagPropertiesManager.getAllTagProperties(notebook);
		const usedKeys = new Set<string>();
		const rangesByKeyAndEditor = new Map<string, Map<string, vscode.Range[]>>();

		const addRange = (kind: BorderKind, tag: string, color: string, editorUri: string, range: vscode.Range): void => {
			const key = this.typeKey(kind, tag, color);
			usedKeys.add(key);
			this.getOrCreateDecorationType(kind, tag, color);
			let byEditor = rangesByKeyAndEditor.get(key);
			if (!byEditor) {
				byEditor = new Map();
				rangesByKeyAndEditor.set(key, byEditor);
			}
			const ranges = byEditor.get(editorUri) ?? [];
			ranges.push(range);
			byEditor.set(editorUri, ranges);
		};

		for (let i = 0; i < notebook.cellCount; i++) {
			const cell = notebook.cellAt(i);
			const editor = uriToEditor.get(cell.document.uri.toString());
			if (!editor) {
				continue;
			}

			const tags = getCellTags(cell);
			const colorByTag: Record<string, string | undefined> = {};
			for (const tag of tags) {
				colorByTag[tag] = allProps[tag]?.color;
			}
			const plan = planTagColorBorders(tags, colorByTag);
			const editorUri = editor.document.uri.toString();
			const document = editor.document;

			if (plan.primary) {
				const layout = boxLineRoles(document.lineCount);
				const { name, color } = plan.primary;
				if (layout.kind === 'single') {
					addRange('boxSingle', name, color, editorUri, lineRange(document, 0, 0));
				} else if (layout.kind === 'split') {
					addRange('boxFirst', name, color, editorUri, lineRange(document, layout.first, layout.first));
					if (layout.middle) {
						addRange(
							'boxMiddle',
							name,
							color,
							editorUri,
							lineRange(document, layout.middle.start, layout.middle.endExclusive - 1)
						);
					}
					addRange('boxLast', name, color, editorUri, lineRange(document, layout.last, layout.last));
				}
			}

			for (const extra of plan.extras) {
				for (const range of eachLineRange(document)) {
					addRange('extraStripe', extra.name, extra.color, editorUri, range);
				}
			}
		}

		const visibleEditors = [...uriToEditor.values()];
		const keysToApply = new Set([...this.decorationTypes.keys(), ...usedKeys]);
		for (const key of keysToApply) {
			const decorationType = this.decorationTypes.get(key);
			if (!decorationType) {
				continue;
			}
			const byEditor = rangesByKeyAndEditor.get(key);
			for (const editor of visibleEditors) {
				const ranges = byEditor?.get(editor.document.uri.toString()) ?? [];
				editor.setDecorations(decorationType, ranges);
			}
		}

		for (const key of [...this.decorationTypes.keys()]) {
			if (!usedKeys.has(key)) {
				this.decorationTypes.get(key)?.dispose();
				this.decorationTypes.delete(key);
			}
		}
	}

	private clearAllDecorations(): void {
		this.decorationTypes.forEach(decorationType => {
			decorationType.dispose();
		});
		this.decorationTypes.clear();
	}

	public dispose(): void {
		this.disposed = true;
		this.detachHotListeners();
		this.clearAllDecorations();
		this.configDisposables.forEach(d => d.dispose());
	}
}

function createDecorationType(kind: BorderKind, color: string): vscode.TextEditorDecorationType {
	const width = TAG_COLOR_CELL_BORDER_WIDTH;
	if (kind === 'extraStripe') {
		return vscode.window.createTextEditorDecorationType({
			before: {
				contentText: ' ',
				width,
				backgroundColor: color,
				margin: '0 2px 0 0',
			},
			after: {
				contentText: ' ',
				width,
				backgroundColor: color,
				margin: '0 0 0 2px',
			},
		});
	}

	let borderWidth = width;
	if (kind === 'boxFirst') {
		borderWidth = `${width} ${width} 0 ${width}`;
	} else if (kind === 'boxMiddle') {
		borderWidth = `0 ${width} 0 ${width}`;
	} else if (kind === 'boxLast') {
		borderWidth = `0 ${width} ${width} ${width}`;
	}

	return vscode.window.createTextEditorDecorationType({
		borderWidth,
		borderStyle: 'solid',
		borderColor: color,
		isWholeLine: true,
	});
}

function lineRange(document: vscode.TextDocument, startLine: number, endLineInclusive: number): vscode.Range {
	if (document.lineCount === 0) {
		return new vscode.Range(0, 0, 0, 0);
	}
	const start = Math.max(0, Math.min(startLine, document.lineCount - 1));
	const end = Math.max(start, Math.min(endLineInclusive, document.lineCount - 1));
	return new vscode.Range(start, 0, end, document.lineAt(end).text.length);
}

function eachLineRange(document: vscode.TextDocument): vscode.Range[] {
	if (document.lineCount === 0) {
		return [new vscode.Range(0, 0, 0, 0)];
	}
	const ranges: vscode.Range[] = [];
	for (let line = 0; line < document.lineCount; line++) {
		ranges.push(new vscode.Range(line, 0, line, document.lineAt(line).text.length));
	}
	return ranges;
}

/** True when notebook change could alter cell tags, structure, or tagProperties colors. */
function notebookChangeMayAffectTagBorders(e: vscode.NotebookDocumentChangeEvent): boolean {
	if (e.metadata) {
		return true;
	}
	if (e.contentChanges.length > 0) {
		return true;
	}
	for (const change of e.cellChanges) {
		if (change.document || change.metadata) {
			return true;
		}
	}
	return false;
}
