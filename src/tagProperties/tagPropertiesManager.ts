import * as vscode from 'vscode';
import { TagProperties } from '../models/tagProperties';

export class TagPropertiesManager {
    private static readonly METADATA_KEY = 'tagProperties';
    
    // Get properties for a specific tag
    public static getTagProperties(notebook: vscode.NotebookDocument, tagName: string): TagProperties {
        const properties = this.getAllTagProperties(notebook);
        return properties[tagName] || {};
    }
    
    // Set properties for a specific tag
    public static setTagProperties(notebook: vscode.NotebookDocument, tagName: string, properties: TagProperties): Thenable<boolean> {
        const allProperties = this.getAllTagProperties(notebook);
        allProperties[tagName] = properties;
        return this.saveTagProperties(notebook, allProperties);
    }
    
    // Get all tag properties from notebook metadata
    public static getAllTagProperties(notebook: vscode.NotebookDocument): Record<string, TagProperties> {
        const metadata = notebook.metadata || {};
        return metadata[this.METADATA_KEY] || {};
    }
    
    // Save tag properties to notebook metadata
    private static saveTagProperties(notebook: vscode.NotebookDocument, properties: Record<string, TagProperties>): Thenable<boolean> {
        const edit = new vscode.WorkspaceEdit();
        const metadata = { ...notebook.metadata } || {};
        metadata[this.METADATA_KEY] = properties;
        
        edit.replaceNotebookMetadata(notebook.uri, metadata);
        return vscode.workspace.applyEdit(edit);
    }
}
