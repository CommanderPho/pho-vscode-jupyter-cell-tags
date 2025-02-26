import * as vscode from 'vscode';
import * as path from 'path';
import { getCellTags } from '../helper';

export async function exportTagsForNotebook(): Promise<void> {
    const editor = vscode.window.activeNotebookEditor;
    if (!editor) {
        vscode.window.showErrorMessage("No active notebook found to export tags.");
        return;
    }

    // Gather each cell's tag metadata using the helper. Adjust extraction if needed.
    const cellsData = editor.notebook.getCells().map(cell => ({
        index: cell.index,
        tags: getCellTags(cell)
    }));

    const content = JSON.stringify(cellsData, null, 2);

    // Compute filename parts: use the notebook file name and a formatted date string.
    const notebookUri = editor.notebook.uri;
    const notebookFileName = path.basename(notebookUri.fsPath, path.extname(notebookUri.fsPath));
    const now = new Date();
    // Format the date to remove characters unsuitable for filenames.
    const formattedDate = now.toISOString().replace(/[:.]/g, '-');
    const exportFileName = `${notebookFileName}_${formattedDate}_tags_export.json`;

    // Determine output directory: same directory as the notebook.
    const notebookDir = path.dirname(notebookUri.fsPath);
    const exportFilePath = path.join(notebookDir, exportFileName);
    const exportUri = vscode.Uri.file(exportFilePath);

    try {
        await vscode.workspace.fs.writeFile(exportUri, Buffer.from(content, 'utf8'));
        vscode.window.showInformationMessage(`Exported tags to ${exportFileName}`);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to export tags: ${err.message}`);
    }
}
