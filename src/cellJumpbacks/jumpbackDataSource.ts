import * as vscode from 'vscode';

/**
 * A JumpbackEntry holds a reference to a specific cell in a notebook,
 * along with metadata. The cellIndex indicates the cell's position,
 * addedAt notes when the jumpback was created, and optional name and note
 * fields allow user customization.
 */
export interface JumpbackEntry {
    cellIndex: number;
    addedAt: string;
    name?: string;
    note?: string;
}

/**
 * JumpbackDataSource wraps access to the jumpback list stored in a notebook's metadata.
 * It provides methods to load, add, remove, and persist jumpback entries.
 *
 * Note: This example assumes that the notebook metadata is a mutable object
 * which contains a "jumpbackList" property.
 */
export class JumpbackDataSource {
    private jumpbacks: JumpbackEntry[];

    private constructor(jumpbacks: JumpbackEntry[]) {
        this.jumpbacks = jumpbacks;
    }

    /**
     * Loads the jumpback list from the provided notebook document.
     * If no jumpback list exists, an empty list is used.
     */
    public static load(notebook: vscode.NotebookDocument): JumpbackDataSource {
        const metadata = (notebook.metadata || {}) as { jumpbackList?: JumpbackEntry[] };
        const list = metadata.jumpbackList || [];
        return new JumpbackDataSource(list);
    }

    /**
     * Persists the jumpback list to the notebook metadata.
     * This implementation uses a WorkspaceEdit to simulate an update;
     * you will need to adjust with the appropriate API.
     */
    public async persist(notebook: vscode.NotebookDocument): Promise<void> {
        const metadata = (notebook.metadata || {}) as { jumpbackList?: JumpbackEntry[] };
        metadata.jumpbackList = this.jumpbacks;
        // Create and apply a dummy WorkspaceEdit. In a real implementation,
        // you would update the notebook metadata using the correct API.
        const edit = new vscode.WorkspaceEdit();
        // For example, if notebooks supported a metadata update API:
        // edit.replaceNotebookMetadata(notebook.uri, metadata);
        // For now, we assume that the above is sufficient.
        await vscode.workspace.applyEdit(edit);
    }

    /**
     * Returns the current list of jumpback entries.
     */
    public getList(): JumpbackEntry[] {
        return this.jumpbacks;
    }

    /**
     * Adds a new jumpback entry.
     * @param entry A JumpbackEntry to add.
     */
    public addJumpback(entry: JumpbackEntry): void {
        // Avoid duplicates for the same cellIndex if needed
        const exists = this.jumpbacks.find(j => j.cellIndex === entry.cellIndex);
        if (!exists) {
            this.jumpbacks.push(entry);
        }
    }

    /**
     * Removes a jumpback entry for the given cell index.
     * @param cellIndex The index of the cell for which to remove the entry.
     */
    public removeJumpback(cellIndex: number): void {
        const index = this.jumpbacks.findIndex(j => j.cellIndex === cellIndex);
        if (index !== -1) {
            this.jumpbacks.splice(index, 1);
        }
    }

    /**
     * Checks if a jumpback entry exists for the given cell index.
     * @param cellIndex The cell index to check.
     */
    public hasJumpback(cellIndex: number): boolean {
        return this.jumpbacks.some(j => j.cellIndex === cellIndex);
    }
}
