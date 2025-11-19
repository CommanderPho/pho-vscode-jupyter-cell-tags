import * as vscode from 'vscode';

/**
 * Represents a markdown heading with its text, level, and position
 */
export interface Heading {
    /** The text content of the heading */
    text: string;
    
    /** The heading level (1-6 for # through ######) */
    level: number;
    
    /** The line number within the cell where the heading appears */
    lineNumber: number;
}

/**
 * Represents an item in the custom notebook outline tree view
 * Extends vscode.TreeItem to integrate with VS Code's tree view API
 */
export class OutlineItem extends vscode.TreeItem {
    /**
     * Creates a new outline item
     * @param heading The heading information (text, level, line number)
     * @param cellIndex The index of the cell containing this heading
     * @param childCellRange The range of cells under this heading
     * @param collapsibleState Whether the item can be expanded/collapsed
     */
    constructor(
        public readonly heading: Heading,
        public readonly cellIndex: number,
        public readonly childCellRange: vscode.NotebookRange,
        collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(heading.text, collapsibleState);

        // Respect configuration for showing cell indices in the outline
        const config = vscode.workspace.getConfiguration('jupyter-cell-tags.customOutline');
        const showCellIndices = config.get<boolean>('showCellIndices', false);
        this.description = showCellIndices ? `Cell ${cellIndex}` : undefined;
        
        // Set the tooltip with more details
        this.tooltip = `${heading.text}\nCell: ${cellIndex}\nLevel: ${heading.level}\nChild cells: ${childCellRange.start}-${childCellRange.end - 1}`;
        
        // Set context value for context menu items
        this.contextValue = 'outlineItem';
        
        // Set icon based on heading level
        this.iconPath = new vscode.ThemeIcon(this.getIconForLevel(heading.level));
        
        // Set command to execute when clicked (navigate to cell)
        this.command = {
            command: 'jupyter-cell-tags.customOutline.selectCell',
            title: 'Select Cell',
            arguments: [this]
        };
    }
    
    /**
     * Get the appropriate icon for a heading level
     * @param level The heading level (1-6)
     * @returns The icon name
     */
    private getIconForLevel(level: number): string {
        // Use different icons for different heading levels
        switch (level) {
            case 1: return 'symbol-class';
            case 2: return 'symbol-method';
            case 3: return 'symbol-property';
            case 4: return 'symbol-field';
            case 5: return 'symbol-variable';
            case 6: return 'symbol-constant';
            default: return 'symbol-misc';
        }
    }
}

/**
 * Represents the complete outline structure for a notebook
 */
export interface OutlineStructure {
    /** Flat list of all outline items in document order */
    items: OutlineItem[];
    
    /** Map from cell index to outline items in that cell */
    cellToItems: Map<number, OutlineItem[]>;
    
    /** Map from outline item to its child cell range */
    itemToRange: Map<OutlineItem, vscode.NotebookRange>;
}

/**
 * Represents the current selection state in the outline view
 */
export interface OutlineSelectionState {
    /** Currently selected outline items */
    selectedItems: OutlineItem[];
    
    /** Corresponding cell indices for selected items */
    selectedCellIndices: number[];
    
    /** Whether the selection originated from the outline or the editor */
    source: 'outline' | 'editor';
}
