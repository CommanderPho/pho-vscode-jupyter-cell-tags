import * as vscode from 'vscode';

export class TagTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly tagName: string
    ) {
        super(label, collapsibleState);
        this.contextValue = 'tagItem';
        
        // Get tag properties from the active notebook
        if (vscode.window.activeNotebookEditor) {
            const properties = this.getTagProperties(tagName);
            
            if (properties?.priority !== undefined) {
                this.description = `Priority: ${properties.priority}`;
                this.tooltip = `Tag: ${tagName}\nPriority: ${properties.priority}`;
            }
        }
        
        this.iconPath = new vscode.ThemeIcon('tag');
    }
    
    private getTagProperties(tagName: string): TagProperties | undefined {
        if (!vscode.window.activeNotebookEditor) {
            return undefined;
        }
        
        const notebook = vscode.window.activeNotebookEditor.notebook;
        const metadata = notebook.metadata || {};
        const tagProperties = metadata['tagProperties'] || {};
        
        return tagProperties[tagName];
    }
}
