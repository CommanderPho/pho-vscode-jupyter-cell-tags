import * as vscode from 'vscode';
import { updateNotebookMetadata } from '../util/notebookMetadata';

/**
 * Workspace-state key prefix for jumpbacks attached to plain text documents.
 * The full key appends the document URI, so each file has its own slot.
 */
const TEXT_JUMPBACKS_STATE_PREFIX = 'jupyter-cell-tags.jumpbacks.text:';

/**
 * Notebook variant: identifies a cell by its index in a notebook.
 *
 * The `kind` property is optional so existing notebook metadata that
 * predates the discriminated union (i.e. plain `{ cellIndex, addedAt }`
 * objects) continues to load without migration.
 */
export interface NotebookJumpbackEntry {
    kind?: 'notebookCell';
    cellIndex: number;
    addedAt: string;
    name?: string;
    note?: string;
}

/**
 * Text-document variant: identifies a position in a plain text file by
 * line and character offsets.
 */
export interface TextJumpbackEntry {
    kind: 'textPosition';
    line: number;
    character: number;
    addedAt: string;
    name?: string;
    note?: string;
}

/**
 * A JumpbackEntry references either a notebook cell or a position in a
 * regular text document, along with metadata. The optional `name` and
 * `note` fields allow user customization.
 */
export type JumpbackEntry = NotebookJumpbackEntry | TextJumpbackEntry;

export function isTextJumpback(entry: JumpbackEntry): entry is TextJumpbackEntry {
    return entry.kind === 'textPosition';
}

export function isNotebookJumpback(entry: JumpbackEntry): entry is NotebookJumpbackEntry {
    return entry.kind === undefined || entry.kind === 'notebookCell';
}

let extensionContext: vscode.ExtensionContext | undefined;

/**
 * Wires the extension context used to persist text-document jumpbacks in
 * workspace state. Must be called once during extension activation; calls
 * before this is set will fall back to in-memory only behavior.
 */
export function setJumpbackExtensionContext(context: vscode.ExtensionContext): void {
    extensionContext = context;
}

function getStorageKeyForTextDoc(document: vscode.TextDocument): string {
    return `${TEXT_JUMPBACKS_STATE_PREFIX}${document.uri.toString()}`;
}

type JumpbackTarget =
    | { kind: 'notebook'; notebook: vscode.NotebookDocument }
    | { kind: 'text'; document: vscode.TextDocument };

/**
 * JumpbackDataSource provides a uniform read/write API across notebooks
 * and plain text documents.
 *
 * Notebook entries persist in notebook metadata under `jumpbackList`.
 * Text-document entries persist in `ExtensionContext.workspaceState`,
 * keyed by the document URI.
 */
export class JumpbackDataSource {
    private constructor(private jumpbacks: JumpbackEntry[], private readonly target: JumpbackTarget) {}


    /**
     * Loads the jumpback list from the provided notebook document.
     * If no jumpback list exists, an empty list is used.
     */
    public static loadFromNotebook(notebook: vscode.NotebookDocument): JumpbackDataSource {
        const metadata = (notebook.metadata || {}) as { jumpbackList?: JumpbackEntry[] };
        const list = (metadata.jumpbackList || []).slice();
        return new JumpbackDataSource(list, { kind: 'notebook', notebook });
    }


    /**
     * Loads the jumpback list for the given text document from workspace state.
     */
    public static loadFromTextDocument(document: vscode.TextDocument): JumpbackDataSource {
        if (!extensionContext) {
            return new JumpbackDataSource([], { kind: 'text', document });
        }
        const stored = extensionContext.workspaceState.get<JumpbackEntry[]>(getStorageKeyForTextDoc(document), []);
        return new JumpbackDataSource(stored.slice(), { kind: 'text', document });
    }


    /**
     * Backwards-compatible alias for `loadFromNotebook`.
     */
    public static load(notebook: vscode.NotebookDocument): JumpbackDataSource {
        return JumpbackDataSource.loadFromNotebook(notebook);
    }


    /**
     * Loads from the most appropriate source for whatever the user has
     * focused: an active notebook editor, otherwise an active text editor
     * (excluding notebook cell editors). Returns undefined when neither is
     * available.
     */
    public static loadFromActiveEditor(): JumpbackDataSource | undefined {
        const notebookEditor = vscode.window.activeNotebookEditor;
        if (notebookEditor) {
            return JumpbackDataSource.loadFromNotebook(notebookEditor.notebook);
        }
        const textEditor = vscode.window.activeTextEditor;
        if (textEditor && textEditor.document.uri.scheme !== 'vscode-notebook-cell') {
            return JumpbackDataSource.loadFromTextDocument(textEditor.document);
        }
        return undefined;
    }


    /**
     * Persists the current jumpback list back to whichever source it was
     * loaded from.
     */
    public async persist(): Promise<void> {
        if (this.target.kind === 'notebook') {
            await updateNotebookMetadata(this.target.notebook, ['jumpbackList'], this.jumpbacks);
            return;
        }
        if (!extensionContext) {
            return;
        }
        const key = getStorageKeyForTextDoc(this.target.document);
        if (this.jumpbacks.length === 0) {
            await extensionContext.workspaceState.update(key, undefined);
        } else {
            await extensionContext.workspaceState.update(key, this.jumpbacks);
        }
    }


    public getList(): JumpbackEntry[] {
        return this.jumpbacks;
    }


    public isNotebook(): boolean {
        return this.target.kind === 'notebook';
    }


    public getNotebook(): vscode.NotebookDocument | undefined {
        return this.target.kind === 'notebook' ? this.target.notebook : undefined;
    }


    public getTextDocument(): vscode.TextDocument | undefined {
        return this.target.kind === 'text' ? this.target.document : undefined;
    }


    /**
     * Adds a notebook-cell jumpback. Returns true on insertion, or false if
     * an entry already exists for that cell index or this data source is
     * not bound to a notebook.
     */
    public addNotebookJumpback(cellIndex: number, addedAt: string = new Date().toISOString()): boolean {
        if (this.target.kind !== 'notebook') {
            return false;
        }
        if (this.hasNotebookJumpback(cellIndex)) {
            return false;
        }
        this.jumpbacks.push({ kind: 'notebookCell', cellIndex, addedAt });
        return true;
    }


    /**
     * Adds a text-position jumpback. Returns true on insertion, or false if
     * an entry already exists at that position or this data source is not
     * bound to a text document.
     */
    public addTextJumpback(line: number, character: number, addedAt: string = new Date().toISOString()): boolean {
        if (this.target.kind !== 'text') {
            return false;
        }
        if (this.hasTextJumpback(line, character)) {
            return false;
        }
        this.jumpbacks.push({ kind: 'textPosition', line, character, addedAt });
        return true;
    }


    public removeNotebookJumpback(cellIndex: number): boolean {
        const idx = this.jumpbacks.findIndex(j => isNotebookJumpback(j) && j.cellIndex === cellIndex);
        if (idx === -1) {
            return false;
        }
        this.jumpbacks.splice(idx, 1);
        return true;
    }


    public removeTextJumpback(line: number, character: number): boolean {
        const idx = this.jumpbacks.findIndex(j => isTextJumpback(j) && j.line === line && j.character === character);
        if (idx === -1) {
            return false;
        }
        this.jumpbacks.splice(idx, 1);
        return true;
    }


    /**
     * Removes any text jumpback whose line matches `line`, regardless of
     * column. Useful for a "remove jumpback at cursor line" UX.
     */
    public removeTextJumpbacksOnLine(line: number): number {
        const before = this.jumpbacks.length;
        this.jumpbacks = this.jumpbacks.filter(j => !(isTextJumpback(j) && j.line === line));
        return before - this.jumpbacks.length;
    }


    public hasNotebookJumpback(cellIndex: number): boolean {
        return this.jumpbacks.some(j => isNotebookJumpback(j) && j.cellIndex === cellIndex);
    }


    public hasTextJumpback(line: number, character: number): boolean {
        return this.jumpbacks.some(j => isTextJumpback(j) && j.line === line && j.character === character);
    }


    /**
     * True if any text jumpback exists on the given line, regardless of column.
     */
    public hasTextJumpbackOnLine(line: number): boolean {
        return this.jumpbacks.some(j => isTextJumpback(j) && j.line === line);
    }


    /**
     * Backwards-compatible alias used by older call sites that only know
     * about notebook-cell jumpbacks.
     */
    public hasJumpback(cellIndex: number): boolean {
        return this.hasNotebookJumpback(cellIndex);
    }
}
