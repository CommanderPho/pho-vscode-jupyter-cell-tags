import * as vscode from 'vscode';

// --- DECORATION TYPES ---
let successBgDec: vscode.TextEditorDecorationType;
let errorBgDec: vscode.TextEditorDecorationType;
let flashDec: vscode.TextEditorDecorationType;
let cmdRunningDec: vscode.TextEditorDecorationType;
let cmdSuccessDec: vscode.TextEditorDecorationType;
let cellRunningDec: vscode.TextEditorDecorationType;
let cellSuccessDec: vscode.TextEditorDecorationType;
let scratchpadDec: vscode.TextEditorDecorationType;

// --- STATE ---
const cellStatusMap = new Map<string, 'success' | 'error'>();
const lastExecutionTimes = new Map<string, number>();
const activeAnimations = new Map<string, () => void>();

// Scratchpad State
const scratchpadCells = new Set<string>(); 
const sourceToScratchpadMap = new Map<string, string>(); 

let output: vscode.OutputChannel;

// --- HIJACK DISPOSABLES ---
let singleHijack: vscode.Disposable | undefined;
let allHijack: vscode.Disposable | undefined;
let isHijacking = false; // Flag to prevent concurrent hijack operations
let executeGate: Promise<void> = Promise.resolve(); // Serialize native execute unwraps
let hasExecutionStateApi = false;

export function activateJupyterEnhancements(context: vscode.ExtensionContext) {
	output = vscode.window.createOutputChannel("Jupyter Enhancements");
	output.appendLine("[INFO] Jupyter Enhancements Activated.");

	reloadDecorations();
	updateLayoutSettings(); // Apply layout settings on startup

	// 1. Settings Listener
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('jupyter-cell-tags.jupyterEnhancements')) {
			output.appendLine("[DEBUG] Settings changed. Reloading decorations & layout.");
			reloadDecorations();
			restoreAllVisibleDecorations();
			updateLayoutSettings(); // Check if layout toggles changed
		}
	}));

	// 2. Scroll Listener (Debounced)
	let scrollTimeout: NodeJS.Timeout | undefined;
	context.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors(editors => {
		if (scrollTimeout) clearTimeout(scrollTimeout);
		scrollTimeout = setTimeout(() => {
			for (const editor of editors) restoreDecorationForEditor(editor);
		}, 100); // Wait 100ms for the user to stop dragging/scrolling
	}));

	// 3. Execution-state API for finished-cell visuals (no forever poll).
	// Fallback: notebook document changes that update executionSummary timing.
	try {
		interface NotebookCellExecutionStateChangeEvent {
			cell: vscode.NotebookCell;
			state: number; // 1 = idle, 2 = pending, 3 = executing
		}
		const notebooksAny = vscode.notebooks as any;
		const onStateChange = notebooksAny?.onDidChangeNotebookCellExecutionState;
		if (typeof onStateChange === 'function') {
			hasExecutionStateApi = true;
			context.subscriptions.push(onStateChange.call(notebooksAny, (e: NotebookCellExecutionStateChangeEvent) => {
				handleExecutionStateChange(e);
			}));
			output.appendLine('[INFO] Using notebookCellExecutionState proposed API.');
		}
	} catch (err) {
		output.appendLine(`[INFO] notebookCellExecutionState unavailable: ${err}`);
	}

	if (!hasExecutionStateApi) {
		context.subscriptions.push(
			vscode.workspace.onDidChangeNotebookDocument(e => {
				for (const change of e.cellChanges) {
					const endTime = change.executionSummary?.timing?.endTime;
					if (endTime === undefined) {
						continue;
					}
					const uri = change.cell.document.uri.toString();
					const lastTime = lastExecutionTimes.get(uri) ?? 0;
					if (endTime > lastTime) {
						handleCellFinished(change.cell, change.executionSummary?.success ?? false);
					}
				}
			})
		);
	}

	// 4. Register Hijacks (single disposable refs; not stacked on context.subscriptions)
	registerHijacks();
	context.subscriptions.push({
		dispose: () => {
			singleHijack?.dispose();
			allHijack?.dispose();
			singleHijack = undefined;
			allHijack = undefined;
		}
	});

	// 5. Register Permanent Commands
	const register = (id: string, handler: (args: any) => any) => {
		context.subscriptions.push(vscode.commands.registerCommand(id, handler));
		output.appendLine(`[DEBUG] Registered Permanent: ${id}`);
	};

	// Main Run Command
	register('jupyter-cell-tags.jupyterEnhancements.execute', (args) => runSequenceHandler('below', args));
	
	// Scratchpad Command
	register('jupyter-cell-tags.jupyterEnhancements.runInScratchpad', runScratchpadHandler);

	// Native multi-cell run (index-based). Do NOT override jupyter.runPrecedent/DependentCells.
	register('notebook.cell.executeCellAndBelow', (args) => runSequenceHandler('below', args));
	register('notebook.cell.executeCellsAbove', (args) => runSequenceHandler('above', args));
	register('jupyter.runCellAndAllBelow', (args) => runSequenceHandler('below', args));
}

export function deactivateJupyterEnhancements() {
	disposeAllDecorations();
	activeAnimations.forEach(stop => stop());
	singleHijack?.dispose();
	allHijack?.dispose();
	singleHijack = undefined;
	allHijack = undefined;
}

// --- LAYOUT SETTINGS HANDLER ---
function updateLayoutSettings() {
	const config = vscode.workspace.getConfiguration('jupyter-cell-tags.jupyterEnhancements');
	const vscodeConfig = vscode.workspace.getConfiguration();

	const enableCompact = config.get<boolean>('layout.enableCompactView', false);
	
	const compactSettings = {
		"notebook.cellExecutionTimeVerbosity": "verbose",
		"notebook.consolidatedRunButton": true,
		"notebook.lineNumbers": "on",
		"notebook.output.lineHeight": 15,
		"notebook.output.minimalErrorRendering": true,
		"notebook.showCellStatusBar": "visibleAfterExecute",
		"notebook.variablesView": true,
		"notebook.insertToolbarLocation": "notebookToolbar"
	};

	if (enableCompact) {
		for (const [key, value] of Object.entries(compactSettings)) {
			if (vscodeConfig.get(key) !== value) {
				vscodeConfig.update(key, value, vscode.ConfigurationTarget.Global);
				output.appendLine(`[Layout] Applied ${key}: ${value}`);
			}
		}
	} else {
		for (const [key, value] of Object.entries(compactSettings)) {
			if (vscodeConfig.get(key) === value) {
				vscodeConfig.update(key, undefined, vscode.ConfigurationTarget.Global);
			}
		}
	}

	const hideToolbar = config.get<boolean>('layout.hideCellToolbar', false);
	const toolbarKey = "notebook.cellToolbarLocation";
	const currentToolbar = vscodeConfig.get(toolbarKey);

	if (hideToolbar) {
		if (JSON.stringify(currentToolbar) !== JSON.stringify({ "default": "hidden" })) {
			vscodeConfig.update(toolbarKey, { "default": "hidden" }, vscode.ConfigurationTarget.Global);
			output.appendLine(`[Layout] Cell Toolbar Hidden`);
		}
	} else {
		if (JSON.stringify(currentToolbar) === JSON.stringify({ "default": "hidden" })) {
			vscodeConfig.update(toolbarKey, { "default": "right" }, vscode.ConfigurationTarget.Global);
			output.appendLine(`[Layout] Cell Toolbar Restored to Right`);
		}
	}
}

// --- HIJACK SETUP ---
/** Re-register only the notebook.cell.execute hijack (leave notebook.execute alone). */
function registerSingleHijack() {
	singleHijack?.dispose();
	singleHijack = undefined;
	singleHijack = vscode.commands.registerCommand('notebook.cell.execute', async (args) => {
		output.appendLine("[DEBUG] >> Hijack: Run Single");
		await runSingleHandler(args);
	});
}

function registerHijacks() {
	// Prevent concurrent hijack operations
	if (isHijacking) {
		output.appendLine("[WARN] Hijack registration already in progress, skipping");
		return;
	}
	
	isHijacking = true;
	try {
		allHijack?.dispose();
		allHijack = undefined;

		registerSingleHijack();

		allHijack = vscode.commands.registerCommand('notebook.execute', async (args) => {
			output.appendLine("[DEBUG] >> Hijack: Run All");
			await runSequenceHandler('all', args);
		});
	} finally {
		isHijacking = false;
	}
}

/** Run native notebook.cell.execute with hijack temporarily removed; serialized. */
async function withNativeCellExecute<T>(fn: () => Promise<T>): Promise<T> {
	const previous = executeGate;
	let release!: () => void;
	executeGate = new Promise<void>(resolve => {
		release = resolve;
	});
	await previous;
	singleHijack?.dispose();
	singleHijack = undefined;
	try {
		return await fn();
	} finally {
		try {
			registerSingleHijack();
		} catch (e) {
			output.appendLine(`[ERROR] Failed to re-register notebook.cell.execute hijack: ${e}`);
			registerHijacks();
		}
		release();
	}
}

// --- SCRATCHPAD HANDLER ---
const runScratchpadHandler = async () => {
	const activeTextEditor = vscode.window.activeTextEditor;
	const notebookEditor = vscode.window.activeNotebookEditor;
	if (!notebookEditor || !activeTextEditor) return;

	const selection = activeTextEditor.selection;
	let text = activeTextEditor.document.getText(selection).trim();
	if (!text) return;

	const notebook = notebookEditor.notebook;
	const sourceCell = notebook.getCells().find(c => c.document.uri.toString() === activeTextEditor.document.uri.toString());
	if (!sourceCell) return;

	const sourceUri = sourceCell.document.uri.toString();
	const sourceRange = new vscode.NotebookRange(sourceCell.index, sourceCell.index + 1);

	let scratchpadCell: vscode.NotebookCell | undefined;
	const existingUri = sourceToScratchpadMap.get(sourceUri);
	if (existingUri) scratchpadCell = notebook.getCells().find(c => c.document.uri.toString() === existingUri);

	if (scratchpadCell) {
		const edit = new vscode.WorkspaceEdit();
		const fullRange = new vscode.Range(0, 0, scratchpadCell.document.lineCount + 1, 0);
		edit.replace(scratchpadCell.document.uri, fullRange, text);
		await vscode.workspace.applyEdit(edit);
	} else {
		const insertIndex = sourceCell.index + 1;
		const cellData = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, text, sourceCell.document.languageId || "python");
		const edit = new vscode.WorkspaceEdit();
		edit.set(notebook.uri, [vscode.NotebookEdit.insertCells(insertIndex, [cellData])]);
		if (await vscode.workspace.applyEdit(edit)) {
			scratchpadCell = notebook.cellAt(insertIndex);
			sourceToScratchpadMap.set(sourceUri, scratchpadCell.document.uri.toString());
			scratchpadCells.add(scratchpadCell.document.uri.toString());
		}
	}

	if (scratchpadCell) {
		restoreDecorationForCell(scratchpadCell);
		
		// Ensure the editor keeps the source cell selected (prevents jump)
		notebookEditor.selections = [sourceRange];

		// We call the command with explicit ranges. 
		// Our updated runSingleHandler above will now see these ranges and run the scratchpad.
		await vscode.commands.executeCommand('notebook.cell.execute', { 
			ranges: [{ start: scratchpadCell.index, end: scratchpadCell.index + 1 }], 
			notebookUri: notebook.uri 
		});

		// Re-confirm selection hasn't moved
		notebookEditor.selections = [sourceRange];
	}
};

// --- RUN SINGLE HANDLER ---
/** Expand notebook execute ranges into unique cell indexes (start inclusive, end exclusive). */
function cellIndexesFromRanges(ranges: Array<{ start: number; end: number }>, cellCount: number): number[] {
	const indexes: number[] = [];
	const seen = new Set<number>();
	for (const range of ranges) {
		const start = Math.max(0, range.start);
		const end = Math.min(cellCount, range.end);
		for (let i = start; i < end; i++) {
			if (!seen.has(i)) {
				seen.add(i);
				indexes.push(i);
			}
		}
	}
	return indexes;
}

const executeOneEnhancedCell = async (cell: vscode.NotebookCell, stopOnErrorMessage: boolean): Promise<boolean> => {
	output.appendLine(`[Single] Executing Cell Index: ${cell.index}`);
	cellStatusMap.delete(cell.document.uri.toString());
	restoreDecorationForCell(cell);

	const stopAnim = startAnimationLoopForCell(cell);
	let success = false;
	try {
		success = await withNativeCellExecute(() => executeCellAndWaitNative(cell));
	} catch (e) {
		const errorMsg = stopOnErrorMessage
			? `Failed to execute cell ${cell.index}. Execution stopped.`
			: `Failed to execute cell ${cell.index}: ${e}`;
		output.appendLine(`[ERROR] ${errorMsg}`);
		vscode.window.showErrorMessage(errorMsg);
		success = false;
	} finally {
		stopAnim();
	}
	handleCellFinished(cell, success);
	return success;
};

const runSingleHandler = async (args?: any) => {
	const editor = vscode.window.activeNotebookEditor;
	if (!editor) return;

	const notebook = editor.notebook;
	let cells: vscode.NotebookCell[] = [];

	// 1. Check if args is the Cell object (standard VS Code behavior)
	if (args && args.document) {
		cells = [args];
	}
	// 2. Check if args contains ranges (Scratchpad, Execute Tag Run Group, etc.)
	else if (args && args.ranges && args.ranges.length > 0) {
		cells = cellIndexesFromRanges(args.ranges, notebook.cellCount).map((i) => notebook.cellAt(i));
	}
	// 3. Fallback: Use current selection(s) — native execute runs all selected cells
	else if (editor.selections.length > 0) {
		cells = cellIndexesFromRanges(
			editor.selections.map((s) => ({ start: s.start, end: s.end })),
			notebook.cellCount
		).map((i) => notebook.cellAt(i));
	}

	if (cells.length === 0) {
		return;
	}

	// Single cell: preserve prior toolbar / scratchpad behavior (run even if markdown/empty)
	if (cells.length === 1) {
		await executeOneEnhancedCell(cells[0], false);
		return;
	}

	// Multiple ranges (e.g. Execute Tag Run Group): run code cells in order, stop on failure
	output.appendLine(`[Single] Executing ${cells.length} cells from ranges`);
	for (const cell of cells) {
		if (cell.kind !== vscode.NotebookCellKind.Code || !cell.document.getText().trim()) {
			continue;
		}

		const range = new vscode.NotebookRange(cell.index, cell.index + 1);
		editor.selections = [range];
		editor.revealRange(range, vscode.NotebookEditorRevealType.InCenterIfOutsideViewport);
		await new Promise((r) => setTimeout(r, 100));

		const success = await executeOneEnhancedCell(cell, true);
		if (!success) {
			break;
		}
	}
};

// --- RUN SEQUENCE HANDLER ---
const runSequenceHandler = async (mode: 'below' | 'above' | 'all', args?: any) => {
	output.appendLine(`[Sequence] Mode: ${mode}`);
	const editor = vscode.window.activeNotebookEditor;
	if (!editor) return;

	const notebook = editor.notebook;
	let loopStart = 0; 
	let loopEnd = notebook.cellCount;
	let anchorIndex = editor.selections[0]?.start ?? 0;

	if (args && typeof args.index === 'number') {
		anchorIndex = args.index;
	} else if (args?.ranges?.length > 0) {
		if (mode === 'above') {
			const last = args.ranges[args.ranges.length - 1];
			anchorIndex = Math.max(0, last.end - 1);
		} else {
			anchorIndex = args.ranges[0].start;
		}
	}

	if (mode === 'all') {
		loopStart = 0; loopEnd = notebook.cellCount;
		cellStatusMap.clear(); clearAllDecorations();
	} else if (mode === 'below') {
		loopStart = anchorIndex; loopEnd = notebook.cellCount;
		if (anchorIndex === 0) { cellStatusMap.clear(); clearAllDecorations(); }
	} else {
		loopStart = 0; loopEnd = anchorIndex + 1;
	}

	for (let i = loopStart; i < loopEnd; i++) {
		const c = notebook.cellAt(i);
		if (c.kind === vscode.NotebookCellKind.Code) {
			cellStatusMap.delete(c.document.uri.toString());
			restoreDecorationForCell(c);
		}
	}

	for (let i = loopStart; i < loopEnd; i++) {
		const cell = notebook.cellAt(i);
		if (cell.kind !== vscode.NotebookCellKind.Code || !cell.document.getText().trim()) continue;

		cellStatusMap.delete(cell.document.uri.toString());
		restoreDecorationForCell(cell);

		const range = new vscode.NotebookRange(i, i + 1);
		editor.selections = [range];
		editor.revealRange(range, vscode.NotebookEditorRevealType.InCenterIfOutsideViewport);

		await new Promise(r => setTimeout(r, 100));

		const stopAnim = startAnimationLoopForCell(cell);
		let success = false;
		try {
			success = await withNativeCellExecute(() => executeCellAndWaitNative(cell));
		} catch (error) {
			output.appendLine(`[ERROR] Cell ${cell.index} execution failed: ${error}`);
			vscode.window.showErrorMessage(`Failed to execute cell ${cell.index}. Execution stopped.`);
			success = false;
		} finally {
			stopAnim();
		}

		handleCellFinished(cell, success);

		if (!success) break;
	}
};

// --- CORE HELPERS ---

/**
 * Execute a cell via native command and wait for *this* run to finish.
 * Uses execution-state API when available; otherwise waits for executionOrder/endTime to change.
 */
async function executeCellAndWaitNative(cell: vscode.NotebookCell): Promise<boolean> {
	const cellUri = cell.document.uri.toString();
	const priorOrder = cell.executionSummary?.executionOrder;
	const priorEnd = cell.executionSummary?.timing?.endTime;

	return new Promise<boolean>((resolve, reject) => {
		let settled = false;
		let sawStarted = false;
		let stateSub: vscode.Disposable | undefined;
		let docSub: vscode.Disposable | undefined;
		let poller: ReturnType<typeof setInterval> | undefined;

		const cleanup = () => {
			if (settled) {
				return;
			}
			settled = true;
			stateSub?.dispose();
			docSub?.dispose();
			if (poller) {
				clearInterval(poller);
			}
			clearTimeout(timeout);
		};

		const finish = (success: boolean) => {
			cleanup();
			resolve(success);
		};

		const fail = (err: unknown) => {
			cleanup();
			reject(err);
		};

		const timeout = setTimeout(() => {
			fail(new Error(`Cell ${cell.index} execution timed out after 5 minutes`));
		}, 5 * 60 * 1000);

		const isSameCell = (other: vscode.NotebookCell) =>
			other.document.uri.toString() === cellUri;

		const summaryLooksComplete = (): boolean | undefined => {
			const summary = cell.executionSummary;
			if (!summary) {
				return undefined;
			}
			const orderChanged =
				summary.executionOrder !== undefined && summary.executionOrder !== priorOrder;
			const endChanged =
				summary.timing?.endTime !== undefined && summary.timing.endTime !== priorEnd;
			if (endChanged) {
				return summary.success ?? false;
			}
			// Some kernels set success/order without timing; accept after we've seen a start
			if (sawStarted && orderChanged && summary.success !== undefined) {
				return summary.success;
			}
			// New order without end yet → still running
			if (orderChanged) {
				sawStarted = true;
				return undefined;
			}
			return undefined;
		};

		try {
			const notebooksAny = vscode.notebooks as any;
			const onStateChange = notebooksAny?.onDidChangeNotebookCellExecutionState;
			if (typeof onStateChange === 'function') {
				stateSub = onStateChange.call(notebooksAny, (e: { cell: vscode.NotebookCell; state: number }) => {
					if (!isSameCell(e.cell)) {
						return;
					}
					// 2 = Pending, 3 = Executing, 1 = Idle
					if (e.state === 2 || e.state === 3) {
						sawStarted = true;
					} else if (e.state === 1 && sawStarted) {
						finish(cell.executionSummary?.success ?? false);
					}
				});
			}
		} catch {
			// fall through to polling
		}

		docSub = vscode.workspace.onDidChangeNotebookDocument(e => {
			if (e.notebook.uri.toString() !== cell.notebook.uri.toString()) {
				return;
			}
			for (const change of e.cellChanges) {
				if (!isSameCell(change.cell)) {
					continue;
				}
				const done = summaryLooksComplete();
				if (done !== undefined) {
					finish(done);
					return;
				}
			}
		});

		poller = setInterval(() => {
			const done = summaryLooksComplete();
			if (done !== undefined) {
				finish(done);
			}
		}, 100);

		vscode.commands.executeCommand('notebook.cell.execute', {
			ranges: [{ start: cell.index, end: cell.index + 1 }],
			notebookUri: cell.notebook.uri
		}).then(undefined, (err) => {
			const errorMsg = `Failed to execute cell ${cell.index}: ${err}`;
			output.appendLine(`[ERROR] ${errorMsg}`);
			vscode.window.showErrorMessage(errorMsg);
			fail(err);
		});
	});
}

function startAnimationLoopForCell(cell: vscode.NotebookCell): () => void {
	const config = vscode.workspace.getConfiguration('jupyter-cell-tags.jupyterEnhancements');
	const enableInner = config.get<boolean>('innerBorder.enable', true);
	const enableOuter = config.get<boolean>('outerBorder.enable', true);

	if (!enableInner && !enableOuter) return () => {};

	let visible = true;
	const toggle = () => {
		const editors = vscode.window.visibleTextEditors.filter(e => e.document.uri.toString() === cell.document.uri.toString());
		for (const editor of editors) {
			const range = new vscode.Range(0, 0, editor.document.lineCount, 0);
			if (enableInner) editor.setDecorations(cmdRunningDec, visible ? [range] : []);
			if (enableOuter) editor.setDecorations(cellRunningDec, visible ? [range] : []);
		}
		visible = !visible;
	};
	toggle(); 
	const timer = setInterval(toggle, 500);
	return () => { clearInterval(timer); removeDecoration(cell, cmdRunningDec); removeDecoration(cell, cellRunningDec); };
}

// --- VISUAL LOGIC ---

function handleExecutionStateChange(e: { cell: vscode.NotebookCell; state: number }) {
	const cell = e.cell;
	if (e.state === 3) { 
		if (!activeAnimations.has(cell.document.uri.toString())) {
			const stop = startAnimationLoopForCell(cell);
			activeAnimations.set(cell.document.uri.toString(), stop);
		}
	} else if (e.state === 1) { 
		if (activeAnimations.has(cell.document.uri.toString())) {
			activeAnimations.get(cell.document.uri.toString())!();
			activeAnimations.delete(cell.document.uri.toString());
		}
		handleCellFinished(cell, cell.executionSummary?.success ?? false);
	}
}

function handleCellFinished(cell: vscode.NotebookCell, success: boolean) {
	const uri = cell.document.uri.toString();
	cellStatusMap.set(uri, success ? 'success' : 'error');
	if (cell.executionSummary?.timing?.endTime) lastExecutionTimes.set(uri, cell.executionSummary.timing.endTime);

	const config = vscode.workspace.getConfiguration('jupyter-cell-tags.jupyterEnhancements');
	if (success && config.get('flash.enable')) {
		applyDecoration(cell, flashDec);
		setTimeout(() => removeDecoration(cell, flashDec), config.get('general.flashDuration', 300));
	}
	restoreDecorationForCell(cell);
}

// --- DECORATION UTILS ---
function restoreDecorationForEditor(editor: vscode.TextEditor) {
	if (editor.document.uri.scheme !== 'vscode-notebook-cell') return;
	if (!editor.selection.isEmpty) return;

	editor.setDecorations(successBgDec, []);
	editor.setDecorations(errorBgDec, []);
	editor.setDecorations(cmdSuccessDec, []);
	editor.setDecorations(cellSuccessDec, []);
	editor.setDecorations(scratchpadDec, []);

	if (scratchpadCells.has(editor.document.uri.toString())) {
		const fullRange = new vscode.Range(0, 0, editor.document.lineCount, 0);
		editor.setDecorations(scratchpadDec, [fullRange]);
	}

	const status = cellStatusMap.get(editor.document.uri.toString());
	if (!status) return; 

	const config = vscode.workspace.getConfiguration('jupyter-cell-tags.jupyterEnhancements');
	const range = new vscode.Range(0, 0, editor.document.lineCount, 0);
	
	if (status === 'success') {
		if (config.get('background.enable')) editor.setDecorations(successBgDec, [range]);
		if (config.get('innerBorder.persist')) editor.setDecorations(cmdSuccessDec, [range]);
		if (config.get('outerBorder.persist')) editor.setDecorations(cellSuccessDec, [range]);
	} else {
		if (config.get('background.enable')) editor.setDecorations(errorBgDec, [range]);
	}
}
function restoreDecorationForCell(cell: vscode.NotebookCell) {
	const editors = vscode.window.visibleTextEditors.filter(e => e.document.uri.toString() === cell.document.uri.toString());
	for (const editor of editors) restoreDecorationForEditor(editor);
}
function restoreAllVisibleDecorations() {
	for (const editor of vscode.window.visibleTextEditors) restoreDecorationForEditor(editor);
}
function applyDecoration(cell: vscode.NotebookCell, dec: vscode.TextEditorDecorationType) {
	const editors = vscode.window.visibleTextEditors.filter(e => e.document.uri.toString() === cell.document.uri.toString());
	for (const editor of editors) { const range = new vscode.Range(0, 0, editor.document.lineCount, 0); editor.setDecorations(dec, [range]); }
}
function removeDecoration(cell: vscode.NotebookCell, dec: vscode.TextEditorDecorationType) {
	const editors = vscode.window.visibleTextEditors.filter(e => e.document.uri.toString() === cell.document.uri.toString());
	for (const editor of editors) editor.setDecorations(dec, []);
}
function clearAllDecorations() {
	const editors = vscode.window.visibleTextEditors;
	for (const editor of editors) {
		if (editor.document.uri.scheme === 'vscode-notebook-cell') {
			editor.setDecorations(successBgDec, []); editor.setDecorations(errorBgDec, []); editor.setDecorations(flashDec, []);
			editor.setDecorations(cmdRunningDec, []); editor.setDecorations(cmdSuccessDec, []); editor.setDecorations(cellRunningDec, []); editor.setDecorations(cellSuccessDec, []);
		}
	}
}
function disposeAllDecorations() {
	successBgDec?.dispose(); errorBgDec?.dispose(); flashDec?.dispose(); cmdRunningDec?.dispose(); cmdSuccessDec?.dispose(); cellRunningDec?.dispose(); cellSuccessDec?.dispose(); scratchpadDec?.dispose();
}
function reloadDecorations() {
	disposeAllDecorations();
	const config = vscode.workspace.getConfiguration('jupyter-cell-tags.jupyterEnhancements');
	
	// --- Determine Border Position and Thickness ---
	const position = config.get<string>('outerBorder.position', 'left');
	const thickness = config.get<string>('outerBorder.thickness', '6px');
	
	// CSS Order: Top Right Bottom Left
	let outerBorderWidth = `0 ${thickness} 0 0`; // Default: Right
	if (position === 'left')  outerBorderWidth = `0 0 0 ${thickness}`;
	if (position === 'right')  outerBorderWidth = `0 ${thickness} 0 0`;
	if (position === 'top')    outerBorderWidth = `${thickness} 0 0 0`;
	if (position === 'bottom') outerBorderWidth = `0 0 ${thickness} 0`;

	successBgDec = vscode.window.createTextEditorDecorationType({ backgroundColor: config.get('background.successColor'), isWholeLine: true });
	errorBgDec = vscode.window.createTextEditorDecorationType({ backgroundColor: config.get('background.errorColor'), isWholeLine: true });
	flashDec = vscode.window.createTextEditorDecorationType({ backgroundColor: config.get('flash.color'), isWholeLine: true });
	
	cmdRunningDec = vscode.window.createTextEditorDecorationType({ borderWidth: '1px', borderStyle: 'solid', borderColor: config.get('innerBorder.runningColor'), isWholeLine: true });
	cmdSuccessDec = vscode.window.createTextEditorDecorationType({ borderWidth: '1px', borderStyle: 'solid', borderColor: config.get('innerBorder.successColor'), isWholeLine: true });
	
	// Apply dynamic width AND thickness to the cell (Outer) indicators
	cellRunningDec = vscode.window.createTextEditorDecorationType({ 
		borderWidth: outerBorderWidth, 
		borderStyle: 'solid', 
		borderColor: config.get('outerBorder.runningColor'), 
		isWholeLine: true 
	});
	cellSuccessDec = vscode.window.createTextEditorDecorationType({ 
		borderWidth: outerBorderWidth, 
		borderStyle: 'solid', 
		borderColor: config.get('outerBorder.successColor'), 
		isWholeLine: true 
	});

	scratchpadDec = vscode.window.createTextEditorDecorationType({
		borderStyle: config.get('scratchpad.borderStyle'),
		borderWidth: config.get('scratchpad.borderWidth'),
		borderColor: config.get('scratchpad.borderColor'),
		backgroundColor: config.get('scratchpad.backgroundColor'),
		isWholeLine: true
	});
}
