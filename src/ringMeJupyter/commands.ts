import * as vscode from 'vscode';

export function registerToggleBellCommand(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('jupyter-cell-tags.ringMeJupyter.toggleBell', async (cell: vscode.NotebookCell) => {
			const newMetadata = {
				...cell.metadata,
				notifyOnComplete: !cell.metadata?.notifyOnComplete
			};
			
			const edit = new vscode.WorkspaceEdit();
			edit.set(cell.notebook.uri, [
				vscode.NotebookEdit.updateCellMetadata(cell.index, newMetadata)
			]);
			await vscode.workspace.applyEdit(edit);
		})
	);
}
