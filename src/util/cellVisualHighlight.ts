import * as vscode from 'vscode';

// Global decoration type
let highlightDecorationType: vscode.TextEditorDecorationType | undefined;

export function initializeCellHighlight() {
    highlightDecorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(255, 200, 0, 0.25)',
        border: '2px solid rgba(255, 165, 0, 0.8)',
        borderRadius: '4px',
        isWholeLine: true,
        overviewRulerColor: 'rgba(255, 165, 0, 0.8)',
        overviewRulerLane: vscode.OverviewRulerLane.Center,
    });
}

export function disposeCellHighlight() {
    highlightDecorationType?.dispose();
    highlightDecorationType = undefined;
}

function isTargetNotebookStillActive(
    targetUri: string,
    cellIndex: number
): boolean {
    const editor = vscode.window.activeNotebookEditor;
    if (!editor) return false;
    if (editor.notebook.uri.toString() !== targetUri) return false;
    if (cellIndex < 0 || cellIndex >= editor.notebook.cellCount) return false;
    return true;
}

export async function highlightCell(
    cellIndex: number,
    options: {
        duration?: number;
        showMessage?: boolean;
        pulse?: boolean;
        pulseCount?: number;
        notebookUri?: vscode.Uri;
    } = {}
) {
    const {
        duration = 2500,
        showMessage = true,
        pulse = false,
        pulseCount = 2,
        notebookUri: optionsNotebookUri
    } = options;

    // Lazy init so feature works even if call order changes
    if (!highlightDecorationType) {
        initializeCellHighlight();
    }
    if (!highlightDecorationType) return;

    const editor = vscode.window.activeNotebookEditor;
    if (!editor) return;

    const notebook = editor.notebook;
    const targetUri = optionsNotebookUri?.toString() ?? notebook.uri.toString();
    if (optionsNotebookUri && notebook.uri.toString() !== targetUri) return;
    if (cellIndex < 0 || cellIndex >= notebook.cellCount) return;

    const cell = notebook.cellAt(cellIndex);
    const range = new vscode.NotebookRange(cellIndex, cellIndex + 1);

    // Reveal and select
    await editor.revealRange(range, vscode.NotebookEditorRevealType.InCenter);
    if (!isTargetNotebookStillActive(targetUri, cellIndex)) return;
    editor.selections = [range];

    // Get text editor for the cell
    const textEditor = await waitForCellTextEditor(cell, 1000);
    if (!textEditor) return;
    if (!isTargetNotebookStillActive(targetUri, cellIndex)) return;

    const fullRange = getCellFullRange(textEditor.document);

    if (pulse) {
        await applyPulseEffect(textEditor, fullRange, pulseCount);
    } else {
        // Apply static decoration
        if (highlightDecorationType) {
            textEditor.setDecorations(highlightDecorationType, [fullRange]);

            const deco = highlightDecorationType;
            setTimeout(() => {
                if (deco && !textEditor.document.isClosed) {
                    textEditor.setDecorations(deco, []);
                }
            }, duration);
        }
    }

    if (showMessage && isTargetNotebookStillActive(targetUri, cellIndex)) {
        const cellType =
            cell.kind === vscode.NotebookCellKind.Code ? 'Code' : 'Markdown';
        vscode.window.setStatusBarMessage(
            `$(target) Focused: ${cellType} Cell #${cellIndex}`,
            duration
        );
    }
}

async function waitForCellTextEditor(
    cell: vscode.NotebookCell,
    timeout: number = 1000
): Promise<vscode.TextEditor | undefined> {
    const cellUri = cell.document.uri.toString();
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        if (cell.document.isClosed) return undefined;
        const editor = vscode.window.visibleTextEditors.find(
            (e) => e.document.uri.toString() === cellUri
        );
        if (editor) return editor;
        await delay(50);
    }

    return undefined;
}

function getCellFullRange(document: vscode.TextDocument): vscode.Range {
    if (document.lineCount === 0) {
        return new vscode.Range(0, 0, 0, 0);
    }
    const lastLine = document.lineCount - 1;
    return new vscode.Range(
        0,
        0,
        lastLine,
        document.lineAt(lastLine).text.length
    );
}

async function applyPulseEffect(
    textEditor: vscode.TextEditor,
    range: vscode.Range,
    pulseCount: number
) {
    for (let i = 0; i < pulseCount; i++) {
        let brightDeco: vscode.TextEditorDecorationType | undefined;
        let dimDeco: vscode.TextEditorDecorationType | undefined;
        try {
            // Bright phase
            brightDeco = vscode.window.createTextEditorDecorationType({
                backgroundColor: 'rgba(255, 200, 0, 0.4)',
                border: '3px solid rgba(255, 165, 0, 1)',
                borderRadius: '4px',
                isWholeLine: true,
            });

            textEditor.setDecorations(brightDeco, [range]);
            await delay(250);

            // Dim phase
            dimDeco = vscode.window.createTextEditorDecorationType({
                backgroundColor: 'rgba(255, 200, 0, 0.15)',
                border: '1px solid rgba(255, 165, 0, 0.4)',
                borderRadius: '4px',
                isWholeLine: true,
            });

            textEditor.setDecorations(dimDeco, [range]);
            await delay(250);
        } finally {
            brightDeco?.dispose();
            dimDeco?.dispose();
        }
    }

    // Clear
    if (
        highlightDecorationType &&
        !textEditor.document.isClosed
    ) {
        textEditor.setDecorations(highlightDecorationType, []);
    }
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
