import * as vscode from 'vscode';
import { reviveCell } from '../util/notebookSelection';
import { JumpbackDataSource, isNotebookJumpback, isTextJumpback } from './jumpbackDataSource';

/**
 * True for a text editor whose document is a real file (not a notebook
 * cell editor). Notebook cells use the `vscode-notebook-cell` URI scheme
 * and are handled via the notebook data source instead.
 */
function isPlainTextEditor(editor: vscode.TextEditor): boolean {
    return editor.document.uri.scheme !== 'vscode-notebook-cell';
}


/**
 * Resolves the active "non-notebook" text editor, preferring the editor
 * the command was invoked from when given.
 */
function resolveActiveTextEditor(arg?: vscode.NotebookCell | vscode.Uri): vscode.TextEditor | undefined {
    if (arg && 'scheme' in arg && 'path' in arg) {
        const uri = vscode.Uri.from(arg);
        const matched = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri.toString());
        if (matched && isPlainTextEditor(matched)) {
            return matched;
        }
    }
    const active = vscode.window.activeTextEditor;
    if (active && isPlainTextEditor(active)) {
        return active;
    }
    return undefined;
}


async function addNotebookJumpback(notebook: vscode.NotebookDocument, cellIndex: number): Promise<void> {
    const ds = JumpbackDataSource.loadFromNotebook(notebook);
    if (!ds.addNotebookJumpback(cellIndex)) {
        vscode.window.showInformationMessage(`Jumpback already exists for cell ${cellIndex}.`);
        return;
    }
    try {
        await ds.persist();
        vscode.window.showInformationMessage(`Jumpback added for cell ${cellIndex}.`);
    } catch (error) {
        const errorMsg = `Failed to update notebook metadata: ${error}`;
        vscode.window.showErrorMessage(errorMsg);
        console.error(errorMsg, error);
    }
}


async function addTextJumpback(editor: vscode.TextEditor): Promise<void> {
    const position = editor.selection.active;
    const ds = JumpbackDataSource.loadFromTextDocument(editor.document);
    if (!ds.addTextJumpback(position.line, position.character)) {
        vscode.window.showInformationMessage(`Jumpback already exists at line ${position.line + 1}.`);
        return;
    }
    try {
        await ds.persist();
        const fileName = editor.document.uri.path.split('/').pop() ?? 'file';
        vscode.window.showInformationMessage(`Jumpback added at ${fileName}:${position.line + 1}.`);
    } catch (error) {
        const errorMsg = `Failed to save jumpback: ${error}`;
        vscode.window.showErrorMessage(errorMsg);
        console.error(errorMsg, error);
    }
}


async function removeNotebookJumpback(notebook: vscode.NotebookDocument, cellIndex: number): Promise<void> {
    const ds = JumpbackDataSource.loadFromNotebook(notebook);
    if (!ds.removeNotebookJumpback(cellIndex)) {
        vscode.window.showInformationMessage(`Jumpback not set for cell ${cellIndex}.`);
        return;
    }
    try {
        await ds.persist();
        vscode.window.showInformationMessage(`Removed jumpback for cell ${cellIndex}.`);
        vscode.commands.executeCommand('setContext', 'jupyter-cell-tags.hasJumpback', false);
    } catch (error) {
        const errorMsg = `Failed to update notebook metadata: ${error}`;
        vscode.window.showErrorMessage(errorMsg);
        console.error(errorMsg, error);
    }
}


async function removeTextJumpback(editor: vscode.TextEditor): Promise<void> {
    const line = editor.selection.active.line;
    const ds = JumpbackDataSource.loadFromTextDocument(editor.document);
    const removed = ds.removeTextJumpbacksOnLine(line);
    if (removed === 0) {
        vscode.window.showInformationMessage(`Jumpback not set at line ${line + 1}.`);
        return;
    }
    try {
        await ds.persist();
        vscode.window.showInformationMessage(`Removed jumpback at line ${line + 1}.`);
        vscode.commands.executeCommand('setContext', 'jupyter-cell-tags.hasJumpback', false);
    } catch (error) {
        const errorMsg = `Failed to save jumpback: ${error}`;
        vscode.window.showErrorMessage(errorMsg);
        console.error(errorMsg, error);
    }
}


export function registerJumpbackCommand(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('jupyter-cell-tags.addJumpback', async (arg?: vscode.NotebookCell | vscode.Uri) => {
        const cell = reviveCell(arg);
        if (cell) {
            const cellIndex = cell.notebook.getCells().indexOf(cell);
            if (cellIndex === -1) {
                vscode.window.showErrorMessage('Unable to determine cell index.');
                return;
            }
            await addNotebookJumpback(cell.notebook, cellIndex);
            return;
        }

        const textEditor = resolveActiveTextEditor(arg);
        if (textEditor) {
            await addTextJumpback(textEditor);
            return;
        }

        vscode.window.showErrorMessage('No active editor or notebook cell to add a jumpback for.');
    }));
}


export function registerRemoveJumpbackCommand(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('jupyter-cell-tags.removeJumpback', async (arg?: vscode.NotebookCell | vscode.Uri) => {
        const cell = reviveCell(arg);
        if (cell) {
            const cellIndex = cell.notebook.getCells().indexOf(cell);
            if (cellIndex === -1) {
                vscode.window.showErrorMessage('Unable to determine cell index.');
                return;
            }
            await removeNotebookJumpback(cell.notebook, cellIndex);
            return;
        }

        const textEditor = resolveActiveTextEditor(arg);
        if (textEditor) {
            await removeTextJumpback(textEditor);
            return;
        }

        vscode.window.showErrorMessage('No active editor or notebook cell to remove a jumpback for.');
    }));
}


/**
 * Opens the document and reveals the position for the given jumpback entry.
 * Used by the tree view's click handler.
 */
export function registerOpenJumpbackCommand(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('jupyter-cell-tags.openJumpback', async (arg: { entry: ReturnType<JumpbackDataSource['getList']>[number]; targetUri: vscode.Uri }) => {
        if (!arg || !arg.entry || !arg.targetUri) {
            return;
        }
        const { entry, targetUri } = arg;

        if (isNotebookJumpback(entry)) {
            const notebook = vscode.workspace.notebookDocuments.find(n => n.uri.toString() === targetUri.toString())
                ?? await vscode.workspace.openNotebookDocument(targetUri);
            const editor = await vscode.window.showNotebookDocument(notebook);
            const cellCount = editor.notebook.cellCount;
            if (cellCount === 0) {
                return;
            }
            const idx = Math.min(entry.cellIndex, cellCount - 1);
            const range = new vscode.NotebookRange(idx, idx + 1);
            editor.selection = range;
            editor.revealRange(range, vscode.NotebookEditorRevealType.Default);
            return;
        }

        if (isTextJumpback(entry)) {
            const doc = await vscode.workspace.openTextDocument(targetUri);
            const editor = await vscode.window.showTextDocument(doc);
            const lastLine = Math.max(0, doc.lineCount - 1);
            const line = Math.min(entry.line, lastLine);
            const character = Math.max(0, Math.min(entry.character, doc.lineAt(line).text.length));
            const pos = new vscode.Position(line, character);
            editor.selection = new vscode.Selection(pos, pos);
            editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        }
    }));
}
