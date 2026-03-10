import * as vscode from 'vscode';
import * as path from 'path';

export async function exportExecutedCodeToPython(): Promise<void> {
    const editor = vscode.window.activeNotebookEditor;
    if (!editor) {
        vscode.window.showErrorMessage("No active notebook found to export executed code.");
        return;
    }

    const cells = editor.notebook.getCells();
    const executedCodeCells = cells.filter(cell => cell.kind === vscode.NotebookCellKind.Code && (cell.metadata?.execution || cell.outputs.length > 0));

    if (executedCodeCells.length === 0) {
        vscode.window.showInformationMessage("No executed code cells in this notebook.");
        return;
    }

    const content = executedCodeCells.map(cell => cell.document.getText()).join('\n\n');

    const notebookUri = editor.notebook.uri;
    const notebookFileName = path.basename(notebookUri.fsPath, path.extname(notebookUri.fsPath));
    const exportFileName = `${notebookFileName}_executed.py`;
    const notebookDir = path.dirname(notebookUri.fsPath);
    const defaultUri = vscode.Uri.file(path.join(notebookDir, exportFileName));

    const saveDialogOptions: vscode.SaveDialogOptions = {
        defaultUri: defaultUri,
        filters: { 'Python': ['py'], 'All files': ['*'] },
        title: 'Export Executed Code to Python'
    };

    const chosenUri = await vscode.window.showSaveDialog(saveDialogOptions);

    if (chosenUri) {
        try {
            await vscode.workspace.fs.writeFile(chosenUri, Buffer.from(content, 'utf8'));
            vscode.window.showInformationMessage(`Exported executed code to ${path.basename(chosenUri.fsPath)}`);
        } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to export executed code: ${err.message}`);
        }
    }
}
