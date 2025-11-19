import * as vscode from 'vscode';
import { OutlineItem } from './models';

/**
 * Interface for bidirectional synchronization between editor selections
 * and the custom notebook outline view.
 */
export interface IOutlineSelectionSync {
    /** Sync notebook editor selections to outline view items */
    syncEditorToOutline(editor: vscode.NotebookEditor, outlineItems: OutlineItem[]): Promise<void>;

    /** Sync outline item selections to the notebook editor */
    syncOutlineToEditor(selectedItems: readonly OutlineItem[]): Promise<void>;
}
