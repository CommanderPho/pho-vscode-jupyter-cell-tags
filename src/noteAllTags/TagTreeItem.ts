import * as vscode from 'vscode';
import { TagProperties } from '../models/tagProperties';
import { TagPropertiesManager } from '../tagProperties/tagPropertiesManager';
import { getHotIconStyle } from './tagHotColor';

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

            if (properties?.createdAt) {
                const createdDate = new Date(properties.createdAt);
                if (!Number.isNaN(createdDate.getTime())) {
                    tooltipParts.push(`Created: ${createdDate.toLocaleString()}`);
                }
            }
            
            if (descriptionParts.length > 0) {
                this.description = descriptionParts.join(' | ');
            }
            if (tooltipParts.length > 1) {
                this.tooltip = tooltipParts.join('\n');
            }
            
            // Manual color wins; otherwise age-based hot color; else default icon
            if (properties?.color) {
                this.iconPath = this.createColoredIconUri(properties.color);
            } else {
                const hot = getHotIconStyle(properties?.createdAt);
                if (hot) {
                    this.iconPath = this.createColoredIconUri(hot.color, hot.opacity);
                } else {
                    this.iconPath = new vscode.ThemeIcon('tag');
                }
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
    
    private createColoredIconUri(color: string, opacity: number = 1): vscode.Uri {
        const safeOpacity = Math.max(0, Math.min(1, opacity));
        // fill-opacity is more reliable than rgba() for tree-view SVG data URIs
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6" fill="${color}" fill-opacity="${safeOpacity}"/></svg>`;
        const encodedSvg = encodeURIComponent(svg);
        return vscode.Uri.parse(`data:image/svg+xml;charset=utf-8,${encodedSvg}`);
    }
}
