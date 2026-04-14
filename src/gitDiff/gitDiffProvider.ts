import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { log } from '../util/logging';
import * as path from 'path';

// ────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────

interface GitCommitInfo {
	hash: string;
	shortHash: string;
	subject: string;
	date: string;
}

interface CellSource {
	/** The joined source text of the cell */
	source: string;
	/** Simple hash of the source for fast comparison */
	hash: string;
	/** Cell kind: 'code' or 'markdown' */
	kind: string;
}

export interface CellDiffResult {
	/** Indices of cells in the current notebook that were modified */
	modified: Set<number>;
	/** Indices of cells in the current notebook that were added (no match in old) */
	added: Set<number>;
	/** Number of cells deleted from the old notebook (present in old, absent in new) */
	deletedCount: number;
}

// ────────────────────────────────────────────────────────
// Git Helpers  (use child_process since the vscode.git
//               API doesn't expose file-at-commit reads)
// ────────────────────────────────────────────────────────

function execGit(args: string[], cwd: string): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile('git', args, { cwd, maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
			if (err) {
				reject(new Error(`git ${args.join(' ')} failed: ${stderr || err.message}`));
			} else {
				resolve(stdout);
			}
		});
	});
}

export async function getRepoRoot(filePath: string): Promise<string> {
	const dir = path.dirname(filePath);
	const root = (await execGit(['rev-parse', '--show-toplevel'], dir)).trim();
	return root;
}

export async function getGitCommits(filePath: string, limit: number = 30): Promise<GitCommitInfo[]> {
	const dir = path.dirname(filePath);
	const stdout = await execGit(
		['log', '--follow', `--format=%H|%h|%s|%ai`, `-n`, `${limit}`, '--', filePath],
		dir
	);
	const lines = stdout.trim().split('\n').filter(l => l.length > 0);
	return lines.map(line => {
		const [hash, shortHash, subject, date] = line.split('|');
		return { hash, shortHash, subject, date };
	});
}

export async function getFileAtCommit(repoRoot: string, commitHash: string, relativePath: string): Promise<string> {
	// Normalize path separators to forward slashes for git
	const gitPath = relativePath.replace(/\\/g, '/');
	return execGit(['show', `${commitHash}:${gitPath}`], repoRoot);
}

// ────────────────────────────────────────────────────────
// Notebook Parsing & Cell Comparison
// ────────────────────────────────────────────────────────

/** Simple string hash — fast, non-crypto, good enough for source comparison */
function simpleHash(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const ch = str.charCodeAt(i);
		hash = ((hash << 5) - hash) + ch;
		hash |= 0; // Convert to 32-bit integer
	}
	return hash.toString(36);
}

export function parseNotebookCells(jsonContent: string): CellSource[] {
	const nb = JSON.parse(jsonContent);
	const cells: any[] = nb.cells || [];
	return cells.map(cell => {
		const sourceArr: string[] = Array.isArray(cell.source) ? cell.source : [cell.source ?? ''];
		const source = sourceArr.join('');
		return {
			source,
			hash: simpleHash(source),
			kind: cell.cell_type || 'code',
		};
	});
}

/**
 * Compare old cells (from a git commit) with new cells (current notebook)
 * using Longest Common Subsequence on source-text hashes.
 *
 * Returns indices in the *new* cell array that are modified or added.
 */
export function compareCells(oldCells: CellSource[], newCells: CellSource[]): CellDiffResult {
	const oldLen = oldCells.length;
	const newLen = newCells.length;

	// Build LCS table on source hashes
	const dp: number[][] = Array.from({ length: oldLen + 1 }, () => new Array(newLen + 1).fill(0));
	for (let i = 1; i <= oldLen; i++) {
		for (let j = 1; j <= newLen; j++) {
			if (oldCells[i - 1].hash === newCells[j - 1].hash &&
				oldCells[i - 1].source === newCells[j - 1].source) {
				dp[i][j] = dp[i - 1][j - 1] + 1;
			} else {
				dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
			}
		}
	}

	// Backtrack to find matched pairs
	const matchedOld = new Set<number>();
	const matchedNew = new Set<number>();
	let i = oldLen, j = newLen;
	while (i > 0 && j > 0) {
		if (oldCells[i - 1].hash === newCells[j - 1].hash &&
			oldCells[i - 1].source === newCells[j - 1].source) {
			matchedOld.add(i - 1);
			matchedNew.add(j - 1);
			i--; j--;
		} else if (dp[i - 1][j] > dp[i][j - 1]) {
			i--;
		} else {
			j--;
		}
	}

	// Cells in new that are NOT in the LCS are either added or modified.
	// Try to find "modified" cells: an unmatched new cell that has a
	// corresponding unmatched old cell at a nearby position (same kind,
	// different source).  Everything else is "added".
	const unmatchedOldIndices = Array.from({ length: oldLen }, (_, k) => k).filter(k => !matchedOld.has(k));
	const unmatchedNewIndices = Array.from({ length: newLen }, (_, k) => k).filter(k => !matchedNew.has(k));

	const modified = new Set<number>();
	const added = new Set<number>();
	const usedOld = new Set<number>();

	// Greedy match: for each unmatched new cell, find the best unmatched old
	// cell of the same kind.  Prefer cells closest in index.
	for (const nIdx of unmatchedNewIndices) {
		let bestOldIdx = -1;
		let bestDist = Infinity;
		for (const oIdx of unmatchedOldIndices) {
			if (usedOld.has(oIdx)) { continue; }
			if (oldCells[oIdx].kind === newCells[nIdx].kind) {
				const dist = Math.abs(oIdx - nIdx);
				if (dist < bestDist) {
					bestDist = dist;
					bestOldIdx = oIdx;
				}
			}
		}
		if (bestOldIdx >= 0) {
			modified.add(nIdx);
			usedOld.add(bestOldIdx);
		} else {
			added.add(nIdx);
		}
	}

	const deletedCount = unmatchedOldIndices.filter(k => !usedOld.has(k)).length;

	return { modified, added, deletedCount };
}

// ────────────────────────────────────────────────────────
// Highlighter Class  (manages decorations & state)
// ────────────────────────────────────────────────────────

export class GitDiffCellHighlighter {
	private modifiedDec: vscode.TextEditorDecorationType | undefined;
	private addedDec: vscode.TextEditorDecorationType | undefined;

	/** Map from cell document URI string → 'modified' | 'added' */
	private cellStatusMap = new Map<string, 'modified' | 'added'>();

	private statusBarItem: vscode.StatusBarItem;
	private scrollDisposable: vscode.Disposable | undefined;
	private configDisposable: vscode.Disposable | undefined;
	private activeEditorDisposable: vscode.Disposable | undefined;

	/** Currently active comparison commit (short hash), or undefined */
	private activeCommitShort: string | undefined;

	constructor() {
		this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
		this.statusBarItem.command = 'jupyter-cell-tags.gitDiff.clearHighlights';
		this.statusBarItem.tooltip = 'Click to clear git diff highlights';
	}

	// ── Lifecycle ──────────────────────────────────────

	activate(context: vscode.ExtensionContext): void {
		this.reloadDecorations();

		// Re-apply when cells scroll into view
		this.scrollDisposable = vscode.window.onDidChangeVisibleTextEditors(editors => {
			for (const editor of editors) {
				this.restoreDecorationForEditor(editor);
			}
		});
		context.subscriptions.push(this.scrollDisposable);

		// Re-apply when active notebook editor changes
		this.activeEditorDisposable = vscode.window.onDidChangeActiveNotebookEditor(() => {
			// Small delay to let cells render
			setTimeout(() => {
				for (const editor of vscode.window.visibleTextEditors) {
					this.restoreDecorationForEditor(editor);
				}
			}, 200);
		});
		context.subscriptions.push(this.activeEditorDisposable);

		// Reload decoration styles when settings change
		this.configDisposable = vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('jupyter-cell-tags.gitDiff')) {
				this.reloadDecorations();
				this.restoreAllVisibleDecorations();
			}
		});
		context.subscriptions.push(this.configDisposable);

		context.subscriptions.push(this.statusBarItem);
	}

	dispose(): void {
		this.clearHighlights();
		this.modifiedDec?.dispose();
		this.addedDec?.dispose();
		this.scrollDisposable?.dispose();
		this.configDisposable?.dispose();
		this.activeEditorDisposable?.dispose();
		this.statusBarItem.dispose();
	}

	// ── Decoration Management ──────────────────────────

	private reloadDecorations(): void {
		this.modifiedDec?.dispose();
		this.addedDec?.dispose();

		const config = vscode.workspace.getConfiguration('jupyter-cell-tags.gitDiff');
		const borderWidth = config.get<string>('borderWidth', '4px');
		const borderStyle = config.get<string>('borderStyle', 'solid');
		const modifiedColor = config.get<string>('modifiedCellColor', '#FFA500');
		const addedColor = config.get<string>('addedCellColor', '#4CAF50');
		const modifiedBg = config.get<string>('modifiedCellBackgroundColor', '#FFA50015');
		const addedBg = config.get<string>('addedCellBackgroundColor', '#4CAF5015');

		// Left border indicator
		const modifiedBorderWidth = `0 0 0 ${borderWidth}`;
		const addedBorderWidth = `0 0 0 ${borderWidth}`;

		this.modifiedDec = vscode.window.createTextEditorDecorationType({
			borderWidth: modifiedBorderWidth,
			borderStyle,
			borderColor: modifiedColor,
			backgroundColor: modifiedBg,
			isWholeLine: true,
			overviewRulerColor: modifiedColor,
			overviewRulerLane: vscode.OverviewRulerLane.Left,
		});

		this.addedDec = vscode.window.createTextEditorDecorationType({
			borderWidth: addedBorderWidth,
			borderStyle,
			borderColor: addedColor,
			backgroundColor: addedBg,
			isWholeLine: true,
			overviewRulerColor: addedColor,
			overviewRulerLane: vscode.OverviewRulerLane.Left,
		});
	}

	private restoreDecorationForEditor(editor: vscode.TextEditor): void {
		if (editor.document.uri.scheme !== 'vscode-notebook-cell') { return; }
		if (!this.modifiedDec || !this.addedDec) { return; }

		const uri = editor.document.uri.toString();
		const status = this.cellStatusMap.get(uri);

		// Clear first
		editor.setDecorations(this.modifiedDec, []);
		editor.setDecorations(this.addedDec, []);

		if (!status) { return; }

		const range = new vscode.Range(0, 0, editor.document.lineCount, 0);
		if (status === 'modified') {
			editor.setDecorations(this.modifiedDec, [range]);
		} else if (status === 'added') {
			editor.setDecorations(this.addedDec, [range]);
		}
	}

	private restoreAllVisibleDecorations(): void {
		for (const editor of vscode.window.visibleTextEditors) {
			this.restoreDecorationForEditor(editor);
		}
	}

	// ── Core Operations ────────────────────────────────

	async compareWithCommit(commitHash: string, commitShortHash: string): Promise<void> {
		const notebookEditor = vscode.window.activeNotebookEditor;
		if (!notebookEditor) {
			vscode.window.showWarningMessage('No active notebook editor.');
			return;
		}

		const notebook = notebookEditor.notebook;
		const notebookUri = notebook.uri;

		// Only file-system notebooks
		if (notebookUri.scheme !== 'file') {
			vscode.window.showWarningMessage('Git diff highlighting only works on notebooks saved to disk.');
			return;
		}

		const filePath = notebookUri.fsPath;

		try {
			const repoRoot = await getRepoRoot(filePath);
			const relativePath = path.relative(repoRoot, filePath);
			const oldContent = await getFileAtCommit(repoRoot, commitHash, relativePath);
			const oldCells = parseNotebookCells(oldContent);

			// Build current cells from the live notebook document
			const currentCells: CellSource[] = notebook.getCells().map(cell => {
				const source = cell.document.getText();
				return {
					source,
					hash: simpleHash(source),
					kind: cell.kind === vscode.NotebookCellKind.Code ? 'code' : 'markdown',
				};
			});

			const diff = compareCells(oldCells, currentCells);

			// Clear previous state
			this.cellStatusMap.clear();

			// Populate status map using cell document URIs
			for (let idx = 0; idx < notebook.cellCount; idx++) {
				const cell = notebook.cellAt(idx);
				const cellUri = cell.document.uri.toString();
				if (diff.modified.has(idx)) {
					this.cellStatusMap.set(cellUri, 'modified');
				} else if (diff.added.has(idx)) {
					this.cellStatusMap.set(cellUri, 'added');
				}
			}

			this.activeCommitShort = commitShortHash;
			this.restoreAllVisibleDecorations();

			// Update status bar
			const modCount = diff.modified.size;
			const addCount = diff.added.size;
			const delCount = diff.deletedCount;
			const parts: string[] = [];
			if (modCount > 0) { parts.push(`${modCount} modified`); }
			if (addCount > 0) { parts.push(`${addCount} added`); }
			if (delCount > 0) { parts.push(`${delCount} deleted`); }
			const summary = parts.length > 0 ? parts.join(', ') : 'no changes';

			this.statusBarItem.text = `$(git-compare) vs ${commitShortHash}: ${summary}`;
			this.statusBarItem.show();

			log(`[GitDiff] Compared with ${commitShortHash}: ${summary}`);
			vscode.window.showInformationMessage(`Git Diff: ${summary} (vs ${commitShortHash})`);

		} catch (err: any) {
			const message = err?.message ?? String(err);
			log(`[GitDiff] Error: ${message}`);
			vscode.window.showErrorMessage(`Git diff failed: ${message}`);
		}
	}

	clearHighlights(): void {
		this.cellStatusMap.clear();
		this.activeCommitShort = undefined;

		// Clear decorations on all visible editors
		if (this.modifiedDec && this.addedDec) {
			for (const editor of vscode.window.visibleTextEditors) {
				if (editor.document.uri.scheme === 'vscode-notebook-cell') {
					editor.setDecorations(this.modifiedDec, []);
					editor.setDecorations(this.addedDec, []);
				}
			}
		}

		this.statusBarItem.hide();
		log('[GitDiff] Highlights cleared.');
	}

	isActive(): boolean {
		return this.activeCommitShort !== undefined;
	}
}

// ────────────────────────────────────────────────────────
// Command Handlers  (registered in startup.ts)
// ────────────────────────────────────────────────────────

export async function pickCommitAndHighlight(highlighter: GitDiffCellHighlighter): Promise<void> {
	const notebookEditor = vscode.window.activeNotebookEditor;
	if (!notebookEditor) {
		vscode.window.showWarningMessage('No active notebook editor.');
		return;
	}

	const notebookUri = notebookEditor.notebook.uri;
	if (notebookUri.scheme !== 'file') {
		vscode.window.showWarningMessage('Git diff highlighting only works on notebooks saved to disk.');
		return;
	}

	const filePath = notebookUri.fsPath;

	let commits: GitCommitInfo[];
	try {
		commits = await getGitCommits(filePath, 40);
	} catch (err: any) {
		vscode.window.showErrorMessage(`Could not retrieve git history: ${err.message}`);
		return;
	}

	if (commits.length === 0) {
		vscode.window.showInformationMessage('No git commits found for this notebook.');
		return;
	}

	const items: vscode.QuickPickItem[] = commits.map(c => ({
		label: `$(git-commit) ${c.shortHash}`,
		description: c.subject,
		detail: c.date,
	}));

	const picked = await vscode.window.showQuickPick(items, {
		placeHolder: 'Select a commit to compare against…',
		matchOnDescription: true,
		matchOnDetail: true,
	});

	if (!picked) { return; } // User cancelled

	const selectedCommit = commits[items.indexOf(picked)];
	await highlighter.compareWithCommit(selectedCommit.hash, selectedCommit.shortHash);
}

export async function highlightVsHead(highlighter: GitDiffCellHighlighter): Promise<void> {
	const notebookEditor = vscode.window.activeNotebookEditor;
	if (!notebookEditor) {
		vscode.window.showWarningMessage('No active notebook editor.');
		return;
	}

	await highlighter.compareWithCommit('HEAD', 'HEAD');
}

// Re-export simpleHash for internal use
function _simpleHash(str: string): string {
	return simpleHash(str);
}
