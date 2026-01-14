import * as vscode from 'vscode';
import { TagProperties } from '../models/tagProperties';

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
            
            // Build description parts
            const descriptionParts: string[] = [];
            const tooltipParts: string[] = [`Tag: ${tagName}`];
            
            if (properties?.priority !== undefined) {
                descriptionParts.push(`Priority: ${properties.priority}`);
                tooltipParts.push(`Priority: ${properties.priority}`);
            }
            
            if (properties?.color) {
                descriptionParts.push(`Color: ${properties.color}`);
                tooltipParts.push(`Color: ${properties.color}`);
            }
            
            if (descriptionParts.length > 0) {
                this.description = descriptionParts.join(' | ');
                this.tooltip = tooltipParts.join('\n');
            }
            
            // Set icon with custom color if available
            if (properties?.color) {
                // Use ThemeIcon with a ThemeColor - VS Code will use the closest theme color
                // For custom colors, we create a colored circle icon
                this.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.foreground'));
                // Note: VS Code TreeItem icons don't support arbitrary colors directly,
                // so we show the color in description and use a filled circle icon
            } else {
                this.iconPath = new vscode.ThemeIcon('tag');
            }
        } else {
            this.iconPath = new vscode.ThemeIcon('tag');
        }
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
