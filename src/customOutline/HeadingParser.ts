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
    private readonly headingRegex = /^(#{1,6})\s+(.+?)(?:\s*#+\s*)?$/gm;
    
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
        
        // Reset regex state
        this.headingRegex.lastIndex = 0;
        
        try {
            // Split by lines to track line numbers
            const lines = cellText.split('\n');
            
            for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
                const line = lines[lineNumber];
                const trimmedLine = line.trim();
                
                // Skip empty lines
                if (!trimmedLine) {
                    continue;
                }
                
                // Try to match heading pattern
                const match = /^(#{1,6})\s+(.+?)(?:\s*#+\s*)?$/.exec(trimmedLine);
                
                if (match) {
                    const level = match[1].length;
                    let text = match[2].trim();
                    
                    // Remove trailing hashes if present
                    text = text.replace(/\s*#+\s*$/, '').trim();
                    
                    // Skip empty headings
                    if (text.length > 0) {
                        headings.push({
                            text,
                            level,
                            lineNumber
                        });
                    }
                }
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
        for (let i = 0; i < outlineItems.length; i++) {
            const range = this.getHeadingCellRange(i, outlineItems);
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
    getHeadingCellRange(headingIndex: number, headings: OutlineItem[]): vscode.NotebookRange {
        // This will be implemented in subtask 2.5
        // For now, return a simple range
        const currentItem = headings[headingIndex];
        return new vscode.NotebookRange(currentItem.cellIndex, currentItem.cellIndex + 1);
    }
}
