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
let extensionContext: vscode.ExtensionContext;

// --- HIJACK DISPOSABLES ---
let singleHijack: vscode.Disposable | undefined;
let allHijack: vscode.Disposable | undefined;

export function activateJupyterEnhancements(context: vscode.ExtensionContext) {
	extensionContext = context;
	output = vscode.window.createOutputChannel("Jupyter Enhancements");
	output.show(true);
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

	// 3. Poller
	const pollInterval = setInterval(checkForFinishedCells, 200);
	context.subscriptions.push({ dispose: () => clearInterval(pollInterval) });

	// 4. Global Event Listener
	const notebooksAny = vscode.notebooks as any;
	if (notebooksAny && typeof notebooksAny.onDidChangeNotebookCellExecutionState === 'function') {
		context.subscriptions.push(notebooksAny.onDidChangeNotebookCellExecutionState((e: any) => {
			handleExecutionStateChange(e);
		}));
	}

	// 5. Register Hijacks
	registerHijacks();

	// 6. Register Permanent Commands
	const register = (id: string, handler: (args: any) => any) => {
		context.subscriptions.push(vscode.commands.registerCommand(id, handler));
		output.appendLine(`[DEBUG] Registered Permanent: ${id}`);
	};

	// Main Run Command
	register('jupyter-cell-tags.jupyterEnhancements.execute', (args) => runSequenceHandler('below', args));
	
	// Scratchpad Command
	register('jupyter-cell-tags.jupyterEnhancements.runInScratchpad', runScratchpadHandler);

	// Native & Jupyter Hijacks
	register('notebook.cell.executeCellAndBelow', (args) => runSequenceHandler('below', args));
	register('notebook.cell.executeCellsAbove', (args) => runSequenceHandler('above', args));
	register('jupyter.runCellAndAllBelow', (args) => runSequenceHandler('below', args));
	register('jupyter.runPrecedentCells', (args) => runSequenceHandler('above', args));
	register('jupyter.runDependentCells', (args) => runSequenceHandler('below', args));
}

export function deactivateJupyterEnhancements() {
	disposeAllDecorations();
	activeAnimations.forEach(stop => stop());
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
function registerHijacks() {
	singleHijack?.dispose();
	allHijack?.dispose();

	singleHijack = vscode.commands.registerCommand('notebook.cell.execute', async (args) => {
		output.appendLine("[DEBUG] >> Hijack: Run Single");
		await runSingleHandler(args);
	});
	extensionContext.subscriptions.push(singleHijack);

	allHijack = vscode.commands.registerCommand('notebook.execute', async (args) => {
		output.appendLine("[DEBUG] >> Hijack: Run All");
		await runSequenceHandler('all', args);
	});
	extensionContext.subscriptions.push(allHijack);
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
const runSingleHandler = async (args?: any) => {
	const editor = vscode.window.activeNotebookEditor;
	if (!editor) return;

	let cell: vscode.NotebookCell | undefined;
	
	// 1. Check if args is the Cell object (standard VS Code behavior)
	if (args && args.document) {
		cell = args; 
	} 
	// 2. Check if args contains ranges (how our Scratchpad calls it)
	else if (args && args.ranges && args.ranges.length > 0) {
		cell = editor.notebook.cellAt(args.ranges[0].start);
	}
	// 3. Fallback: Use current selection
	else if (editor.selections.length > 0) {
		cell = editor.notebook.cellAt(editor.selections[0].start);
	}

	if (cell) {
		output.appendLine(`[Single] Executing Cell Index: ${cell.index}`);
		cellStatusMap.delete(cell.document.uri.toString());
		restoreDecorationForCell(cell);

		const stopAnim = startAnimationLoopForCell(cell);
		singleHijack?.dispose(); 

		try {
			await vscode.commands.executeCommand('notebook.cell.execute', { 
				ranges: [{ start: cell.index, end: cell.index + 1 }], 
				notebookUri: cell.notebook.uri 
			});
		} catch (e) {
			output.appendLine(`[ERROR] Exec failed: ${e}`);
		} finally {
			registerHijacks(); 
		}

		stopAnim();
		handleCellFinished(cell, cell.executionSummary?.success ?? false);
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

	if (args && args.document) anchorIndex = args.index;

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

	singleHijack?.dispose();

	try {
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
			await executeCellAndWaitNative(cell);
			stopAnim();
			
			const success = cell.executionSummary?.success ?? false;
			handleCellFinished(cell, success);

			if (!success) break;
		}
	} finally {
		registerHijacks();
	}
};

// --- CORE HELPERS ---

async function executeCellAndWaitNative(cell: vscode.NotebookCell): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		const poller = setInterval(() => {
			if (cell.executionSummary?.success !== undefined) {
				clearInterval(poller);
				resolve(cell.executionSummary.success);
			}
		}, 100);

		vscode.commands.executeCommand('notebook.cell.execute', {
			ranges: [{ start: cell.index, end: cell.index + 1 }],
			notebookUri: cell.notebook.uri
		}).then(undefined, (err) => { output.appendLine(`[ERROR] Exec failed: ${err}`); });
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

function handleExecutionStateChange(e: any) {
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

function checkForFinishedCells() {
	const editor = vscode.window.activeNotebookEditor;
	if (!editor) return;
	for (const cell of editor.notebook.getCells()) {
		if (cell.kind !== vscode.NotebookCellKind.Code) continue;
		const summary = cell.executionSummary;
		if (summary && summary.timing?.endTime) {
			const uri = cell.document.uri.toString();
			const lastTime = lastExecutionTimes.get(uri) ?? 0;
			if (summary.timing.endTime > lastTime) {
				handleCellFinished(cell, summary.success ?? false);
			}
		}
	}
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
