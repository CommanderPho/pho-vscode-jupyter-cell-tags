import * as vscode from 'vscode';

export class BellStatusBarItemProvider implements vscode.NotebookCellStatusBarItemProvider {
    provideCellStatusBarItems(cell: vscode.NotebookCell): vscode.NotebookCellStatusBarItem[] {
        //current state of the notification
        const isEnabled = cell.metadata?.notifyOnComplete ?? false;

        const bellItem: vscode.NotebookCellStatusBarItem = {
            text: isEnabled ? "🔔 Notify On" : "🔕 Notify Off",
            alignment: vscode.NotebookCellStatusBarAlignment.Right,
            tooltip: "Toggle execution notification",
            command: {
                command: "jupyter-cell-tags.ringMeJupyter.toggleBell",
                title: "Toggle Notification",
                arguments: [cell]
            }
        };
		
        return [bellItem];
    }
}

export function registerStatusBarProvider(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.notebooks.registerNotebookCellStatusBarItemProvider(
            "jupyter-notebook", //only for jupyter notebooks type file
            new BellStatusBarItemProvider()
        )
    );
}
