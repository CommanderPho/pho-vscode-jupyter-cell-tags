import * as vscode from 'vscode';
import { TagProperties } from '../models/tagProperties';
// import { updateNotebookMetadata } from '../util/notebookMetadata';
import { SidecarManager } from '../sidecar/sidecarManager';



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
    
    // Get all tag properties from sidecar file
    public static getAllTagProperties(notebook: vscode.NotebookDocument): Record<string, TagProperties> {
        // First try to get from sidecar file
        const sidecarData = SidecarManager.loadFromSidecar(notebook.uri);
        if (sidecarData && sidecarData[this.METADATA_KEY]) {
            return sidecarData[this.METADATA_KEY];
        }
        
        // Fall back to notebook metadata
        const metadata = notebook.metadata || {};
        return metadata[this.METADATA_KEY] || {};
    }
    
    // Save tag properties to sidecar file
    private static saveTagProperties(notebook: vscode.NotebookDocument, properties: Record<string, TagProperties>): Thenable<boolean> {
        return SidecarManager.updateSidecarMetadata(notebook.uri, [this.METADATA_KEY], properties);
    }
}
