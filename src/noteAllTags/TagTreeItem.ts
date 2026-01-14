import * as vscode from 'vscode';
import { TagProperties } from '../models/tagProperties';
import { TagPropertiesManager } from '../tagProperties/tagPropertiesManager';

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
                // Create a custom colored icon using SVG data URI
                this.iconPath = this.createColoredIconUri(properties.color);
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
        return TagPropertiesManager.getTagProperties(notebook, tagName);
    }
    
    private createColoredIconUri(color: string): vscode.Uri {
        // Create an SVG with a filled circle using the tag's color
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6" fill="${color}"/></svg>`;
        // Encode the SVG as a data URI
        const encodedSvg = encodeURIComponent(svg);
        return vscode.Uri.parse(`data:image/svg+xml;charset=utf-8,${encodedSvg}`);
    }
}
