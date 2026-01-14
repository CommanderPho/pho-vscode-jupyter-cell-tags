import * as vscode from 'vscode';
import { Heading, OutlineItem } from './models';

/**
 * Interface for parsing markdown headings from notebook cells
 */
export interface IHeadingParser {
    /**
     * Parse headings from a single markdown cell
     * @param cell The notebook cell to parse
     * @returns Array of headings found in the cell
     */
    parseHeadings(cell: vscode.NotebookCell): Heading[];
    
    /**
     * Extract all headings from a notebook and create outline items
     * @param notebook The notebook document to extract headings from
     * @returns Array of outline items representing the notebook structure
     */
    extractNotebookHeadings(notebook: vscode.NotebookDocument): OutlineItem[];
    
    /**
     * Calculate the cell range for a heading (heading cell through cells before next heading)
     * @param headingIndex The index of the heading in the outline items array
     * @param headings All outline items in the notebook
     * @returns The range of cells under this heading
     */
    getHeadingCellRange(headingIndex: number, headings: OutlineItem[]): vscode.NotebookRange;
}
