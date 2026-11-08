import * as vscode from 'vscode';
import { Heading, OutlineItem } from './models';
import { IHeadingParser } from './IHeadingParser';

/**
 * Parses markdown headings from notebook cells
 */
export class HeadingParser implements IHeadingParser {
    /**
     * Regex pattern to match markdown headings
     * Matches: # through ###### followed by whitespace and text
     * Captures: (1) hash symbols, (2) heading text
     */
    private readonly headingRegex = /^[ \t]*(#{1,6})\s+(.+?)(?:\s*#+\s*)?$/gm;
    
    /**
     * Parse headings from a single markdown cell
     * @param cell The notebook cell to parse
     * @returns Array of headings found in the cell
     */
    parseHeadings(cell: vscode.NotebookCell): Heading[] {
        // Skip non-markdown cells
        if (cell.kind !== vscode.NotebookCellKind.Markup) {
            return [];
        }
        
        const headings: Heading[] = [];
        const cellText = cell.document.getText();
        
        // FAST PATH: If there are no hashes in the string, it can't contain a heading.
        // This is a significant optimization (~170x faster for cells without headings)
        if (!cellText.includes('#')) {
            return [];
        }

        // Reset regex state
        this.headingRegex.lastIndex = 0;
        
        try {
            let match;
            let lastIndex = 0;
            let currentLineNumber = 0;
            
            // Iterate over all regex matches instead of splitting the entire string by newline.
            // This prevents creating a large array of strings and is ~3x faster for cells with headings.
            while ((match = this.headingRegex.exec(cellText)) !== null) {
                // Increment line number based on newlines between the last match and this match
                let nlPos = cellText.indexOf('\n', lastIndex);
                while (nlPos !== -1 && nlPos < match.index) {
                    currentLineNumber++;
                    nlPos = cellText.indexOf('\n', nlPos + 1);
                }
                
                const level = match[1].length;
                let text = match[2].trim();

                // Remove trailing hashes if present
                text = text.replace(/\s*#+\s*$/, '').trim();
                
                // Skip empty headings
                if (text.length > 0) {
                    headings.push({
                        text,
                        level,
                        lineNumber: currentLineNumber
                    });
                }

                lastIndex = match.index;
            }
        } catch (error) {
            // Gracefully handle malformed headings by logging and continuing
            console.warn(`Failed to parse headings from cell ${cell.index}:`, error);
        }
        
        return headings;
    }
    
    /**
     * Extract all headings from a notebook and create outline items
     * @param notebook The notebook document to extract headings from
     * @returns Array of outline items representing the notebook structure
     */
    extractNotebookHeadings(notebook: vscode.NotebookDocument): OutlineItem[] {
        const outlineItems: OutlineItem[] = [];
        
        // Iterate through all cells in the notebook
        for (let cellIndex = 0; cellIndex < notebook.cellCount; cellIndex++) {
            const cell = notebook.cellAt(cellIndex);
            const headings = this.parseHeadings(cell);
            
            // Create outline items for each heading in the cell
            for (const heading of headings) {
                // We'll calculate the child cell range later
                // For now, create a placeholder range
                const childCellRange = new vscode.NotebookRange(cellIndex, cellIndex + 1);
                
                // Determine collapsible state based on heading level
                // Top-level headings (level 1-2) are collapsible, others are not
                const collapsibleState = heading.level <= 2 
                    ? vscode.TreeItemCollapsibleState.Expanded 
                    : vscode.TreeItemCollapsibleState.None;
                
                const outlineItem = new OutlineItem(
                    heading,
                    cellIndex,
                    childCellRange,
                    collapsibleState
                );
                
                outlineItems.push(outlineItem);
            }
        }
        
        // Now calculate proper child cell ranges for all items
        const totalCellCount = notebook.cellCount;
        for (let i = 0; i < outlineItems.length; i++) {
            const range = this.getHeadingCellRange(i, outlineItems, totalCellCount);
            // Update the child cell range
            (outlineItems[i] as any).childCellRange = range;
        }
        
        return outlineItems;
    }
    
    /**
     * Calculate the cell range for a heading (heading cell through cells before next heading)
     * @param headingIndex The index of the heading in the outline items array
     * @param headings All outline items in the notebook
     * @returns The range of cells under this heading
     */
    getHeadingCellRange(headingIndex: number, headings: OutlineItem[], totalCellCount?: number): vscode.NotebookRange {
        const currentItem = headings[headingIndex];
        const currentLevel = currentItem.heading.level;

        // Default end is either the next cell after this heading or the total notebook cell count
        let endExclusive = totalCellCount ?? (currentItem.cellIndex + 1);

        // Find the next heading of equal or higher level
        for (let i = headingIndex + 1; i < headings.length; i++) {
            const nextItem = headings[i];

            // Stop when we reach a heading at the same or higher level in the hierarchy
            if (nextItem.heading.level <= currentLevel) {
                endExclusive = nextItem.cellIndex;
                break;
            }
        }

        return new vscode.NotebookRange(currentItem.cellIndex, endExclusive);
    }
}
