import * as vscode from 'vscode';
import { updateCellTags } from '../helper';

export async function importTagsForNotebook() {
    const editor = vscode.window.activeNotebookEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active notebook');
        return;
    }

    const fileResult = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: { 'JSON files': ['json'] }
    });

    if (!fileResult || fileResult.length === 0) {
        return;
    }

    try {
        const fileContent = await vscode.workspace.fs.readFile(fileResult[0]);
        const tagsData = JSON.parse(fileContent.toString());
        // Track metrics
        let cellsUpdated = 0;
        const uniqueTags = new Set<string>();

        // Apply tags to cells
        for (const [index, cellTags] of Object.entries(tagsData)) {
            const cellIndex = parseInt(index);
            if (cellIndex < editor.notebook.cellCount) {
                const cell = editor.notebook.cellAt(cellIndex);
                const tagsArray = Array.isArray(cellTags) ? cellTags : [];
                await updateCellTags(cell, tagsArray as string[]);
                cellsUpdated++;

                // Add each tag to the set of unique tags
                tagsArray.forEach(tag => uniqueTags.add(tag));
            }
        }

        // vscode.window.showInformationMessage('Tags imported successfully');
        vscode.window.showInformationMessage(`Tags imported successfully: ${uniqueTags.size} unique tags applied to ${cellsUpdated} cells`);


    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        vscode.window.showErrorMessage('Failed to import tags: ' + errorMessage);
    }
}
