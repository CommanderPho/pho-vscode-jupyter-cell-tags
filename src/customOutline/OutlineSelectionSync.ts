import * as vscode from 'vscode';
import { IOutlineSelectionSync } from './IOutlineSelectionSync';
import { OutlineItem } from './models';
import { notebookRangesToIndices } from '../util/notebookSelection';
import { SelectionChangeDetector } from '../outlineSync/SelectionChangeDetector';
import { log } from '../util/logging';

/**
 * Implements bidirectional synchronization between editor selections and
 * the custom notebook outline view, reusing SelectionChangeDetector.
 */
export class OutlineSelectionSync implements IOutlineSelectionSync {
    constructor(
        private readonly treeView: vscode.TreeView<OutlineItem>,
        private readonly selectionDetector: SelectionChangeDetector | undefined
    ) {}

    /**
     * Sync notebook editor selections to outline view items.
     * Highlights outline items whose heading cells are selected in the editor.
     */
    async syncEditorToOutline(editor: vscode.NotebookEditor, outlineItems: OutlineItem[]): Promise<void> {
        if (!outlineItems.length) {
            return;
        }

        // Determine which cell indices are selected
        const selectedIndices = new Set<number>(notebookRangesToIndices(editor.selections));
        if (!selectedIndices.size) {
            return;
        }

        const itemsToSelect = outlineItems.filter(item => selectedIndices.has(item.cellIndex));
        if (!itemsToSelect.length) {
            return;
        }

        try {
            // Reveal and select all corresponding outline items. Sequential reveal
            // calls with select=true are used as TreeView has no direct multi-select API.
            for (const item of itemsToSelect) {
                await this.treeView.reveal(item, { select: true, focus: false, expand: false });
            }
        } catch (error) {
            log(`Failed to sync editor selections to custom outline: ${error}`);
        }
    }

    /**
     * Sync outline item selections to the notebook editor.
     * Selecting items in the outline selects their heading cells in the editor.
     */
    async syncOutlineToEditor(selectedItems: readonly OutlineItem[]): Promise<void> {
        const editor = vscode.window.activeNotebookEditor;
        if (!editor || !selectedItems.length) {
            return;
        }

        const ranges = selectedItems.map(item => new vscode.NotebookRange(item.cellIndex, item.cellIndex + 1));

        try {
            if (this.selectionDetector) {
                // Use shared SelectionChangeDetector so that outline-selection-sync
                // continues to work and debounce logic is reused.
                this.selectionDetector.triggerSelectionChange(editor, ranges);
            } else {
                editor.selections = ranges;
            }
        } catch (error) {
            log(`Failed to sync custom outline selection to editor: ${error}`);
        }
    }
}
