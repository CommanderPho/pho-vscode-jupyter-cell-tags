import * as vscode from 'vscode';
import { OutlineItem } from './models';

/**
 * Interface for the custom notebook outline tree data provider
 */
export interface INotebookOutlineTreeDataProvider extends vscode.TreeDataProvider<OutlineItem> {
    /** Refresh the outline view for the current notebook */
    refresh(notebook?: vscode.NotebookDocument): void;

    /** Get flat list of outline items for the active notebook */
    getOutlineItems(): OutlineItem[];

    /** Get currently selected outline items (if tracked) */
    getSelectedItems(): OutlineItem[];

    /** Select outline items corresponding to the given cell indices */
    selectItems(cellIndices: number[]): void;

    /**
     * Update which outline items are currently \"in view\" in the notebook.
     * Implementations should update any visual indicators and refresh the tree.
     */
    updateVisibleItems(visibleItems: Set<OutlineItem>): void;
}
