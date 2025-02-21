import * as vscode from 'vscode';

export class CellTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly tag: string
    ) {
        super(label, collapsibleState);

        // // Optional: Add an icon to represent a tag
        // this.iconPath = {
        //     light: vscode.Uri.file(require.resolve('./resources/tag-light.svg')),
        //     dark: vscode.Uri.file(require.resolve('./resources/tag-dark.svg'))
        // };

        // Set context value for when clauses in package.json
        this.contextValue = 'cellItem';

        // Optional: Add a tooltip
        this.tooltip = `Cell: ${this.label}`;
    }
}
