import * as vscode from 'vscode';
import { IOutlineSelectionSync } from './IOutlineSelectionSync';
import { OutlineItem, ExecutedCellLineItem, NotebookTreeItem } from './models';
import { getSelectionDetector } from '../outlineSync/startup';
import { isValidCellIndex } from '../util/notebookSelection';
import { log } from '../util/logging';

/**
 * Map selected outline tree rows to deduplicated single-cell notebook ranges.
 * Headings and executed-cell markers each contribute their cell index.
 */
export function notebookRangesFromOutlineSelection(
    selectedItems: readonly vscode.TreeItem[]
): vscode.NotebookRange[] {
    const seen = new Set<number>();
    const ranges: vscode.NotebookRange[] = [];

    for (const item of selectedItems) {
        let cellIndex: number | undefined;
        if (item instanceof OutlineItem || item instanceof ExecutedCellLineItem) {
            cellIndex = item.cellIndex;
        }
        if (cellIndex === undefined || seen.has(cellIndex)) {
            continue;
        }
        seen.add(cellIndex);
        ranges.push(new vscode.NotebookRange(cellIndex, cellIndex + 1));
    }

    return ranges;
}

function cellIndexOfTreeItem(item: vscode.TreeItem): number | undefined {
    if (item instanceof OutlineItem || item instanceof ExecutedCellLineItem) {
        return item.cellIndex;
    }
    return undefined;
}

/**
 * Implements bidirectional synchronization between editor selections and
 * the custom notebook outline view, reusing SelectionChangeDetector.
 */
export class OutlineSelectionSync implements IOutlineSelectionSync {
    private currentSectionKey: string | undefined;
    private syncingFromEditor = false;

    constructor(
        private readonly treeView: vscode.TreeView<NotebookTreeItem>
    ) {}

    isSyncingFromEditor(): boolean {
        return this.syncingFromEditor;
    }

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

        if (!bestMatch) {
            return;
        }

        const matchKey = outlineItemKey(bestMatch);
        if (matchKey === this.currentSectionKey) {
            return;
        }

        this.currentSectionKey = matchKey;
        this.syncingFromEditor = true;
        try {
            // Scroll the custom outline so the current section is visible.
            // We intentionally do not change selection here to avoid
            // interfering with multi-select behavior. Same-section caret
            // moves skip reveal entirely (stable key), so expand is only
            // for navigating into a new heading.
            await this.treeView.reveal(bestMatch, { select: false, focus: false, expand: true });
        } catch (error) {
            log(`Failed to sync editor selections to custom outline: ${error}`);
        } finally {
            this.syncingFromEditor = false;
        }
    }

    /**
     * Sync outline item selections to the notebook editor.
     * Each selected heading or executed-cell row selects its cell.
     * Reveals the last selected item so plain click still navigates.
     */
    async syncOutlineToEditor(selectedItems: readonly vscode.TreeItem[]): Promise<void> {
        const editor = vscode.window.activeNotebookEditor;
        if (!editor || !selectedItems.length) {
            return;
        }

        const ranges = notebookRangesFromOutlineSelection(selectedItems);
        if (!ranges.length) {
            return;
        }

        try {
            const selectionDetector = getSelectionDetector();
            if (selectionDetector) {
                selectionDetector.triggerSelectionChange(editor, ranges);
            } else {
                editor.selections = ranges;
            }

            const lastItem = selectedItems[selectedItems.length - 1];
            const revealIndex = cellIndexOfTreeItem(lastItem);
            if (revealIndex !== undefined && isValidCellIndex(editor.notebook, revealIndex)) {
                const revealRange = new vscode.NotebookRange(revealIndex, revealIndex + 1);
                editor.revealRange(revealRange, vscode.NotebookEditorRevealType.AtTop);
            }
        } catch (error) {
            log(`Failed to sync custom outline selection to editor: ${error}`);
        }
    }
}

function outlineItemKey(item: OutlineItem): string {
    return `${item.cellIndex}:${item.heading.level}:${item.heading.lineNumber}`;
}
