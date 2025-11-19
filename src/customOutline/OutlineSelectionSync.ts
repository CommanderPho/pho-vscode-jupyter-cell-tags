import * as vscode from 'vscode';
import { IOutlineSelectionSync } from './IOutlineSelectionSync';
import { OutlineItem } from './models';
import { SelectionChangeDetector } from '../outlineSync/SelectionChangeDetector';
import { log } from '../util/logging';

/**
 * Implements bidirectional synchronization between editor selections and
 * the custom notebook outline view, reusing SelectionChangeDetector.
 */
export class OutlineSelectionSync implements IOutlineSelectionSync {
    private currentSection: OutlineItem | undefined;

    constructor(
        private readonly treeView: vscode.TreeView<OutlineItem>,
        private readonly selectionDetector: SelectionChangeDetector | undefined
    ) {}

    /**
     * Sync notebook editor position to outline view items.
     * Finds the deepest heading whose child range contains the primary
     * selected cell and scrolls the outline so that item is visible.
     */
    async syncEditorToOutline(editor: vscode.NotebookEditor, outlineItems: OutlineItem[]): Promise<void> {
        if (!outlineItems.length) {
            return;
        }

        if (!editor.selections.length) {
            return;
        }

        // Use the first selection's start index as the primary position
        const primaryIndex = editor.selections[0].start;

        // Find the deepest heading whose child range contains the primary cell
        let bestMatch: OutlineItem | undefined;
        for (const item of outlineItems) {
            const range = item.childCellRange;
            if (range.start <= primaryIndex && primaryIndex < range.end) {
                if (!bestMatch || item.heading.level >= bestMatch.heading.level) {
                    bestMatch = item;
                }
            }
        }

        if (!bestMatch || bestMatch === this.currentSection) {
            return;
        }

        this.currentSection = bestMatch;

        try {
            // Scroll the custom outline so the current section is visible.
            // We intentionally do not change selection here to avoid
            // interfering with multi-select behavior.
            await this.treeView.reveal(bestMatch, { select: false, focus: false, expand: true });
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
