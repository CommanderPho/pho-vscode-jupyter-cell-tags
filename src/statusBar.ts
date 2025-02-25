import * as vscode from 'vscode';

export class VersionStatusBarItem {
    private statusBarItem: vscode.StatusBarItem;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.update();
        this.statusBarItem.show();
    }

    private update() {
        const extension = vscode.extensions.getExtension('phohale.pho-vscode-jupyter-cell-tags');
        const pluginVersion = extension?.packageJSON.version || 'unknown';
        const vscodeVersion = vscode.version;
        
        this.statusBarItem.text = `$(versions) VSCode: ${vscodeVersion} | Plugin: ${pluginVersion}`;
        this.statusBarItem.tooltip = 'Jupyter Cell Tags Version Info';
    }

    public dispose() {
        this.statusBarItem.dispose();
    }
}
