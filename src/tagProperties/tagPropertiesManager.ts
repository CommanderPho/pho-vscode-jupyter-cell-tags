import * as vscode from 'vscode';
import { TagProperties } from '../models/tagProperties';
import { updateNotebookMetadata } from '../util/notebookMetadata';


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

    /**
     * Stamp createdAt on a tag if it does not already have one.
     * Returns true if a stamp was written, false if already present or write failed.
     */
    public static async ensureCreatedAt(notebook: vscode.NotebookDocument, tagName: string): Promise<boolean> {
        const existing = this.getTagProperties(notebook, tagName);
        if (existing.createdAt) {
            return false;
        }
        return this.setTagProperties(notebook, tagName, {
            ...existing,
            createdAt: new Date().toISOString()
        });
    }
    
    // Get all tag properties from notebook metadata (cloned — never mutate live metadata)
    public static getAllTagProperties(notebook: vscode.NotebookDocument): Record<string, TagProperties> {
        const metadata = notebook.metadata || {};
        const props = metadata[this.METADATA_KEY] || {};
        const clone: Record<string, TagProperties> = {};
        for (const key of Object.keys(props)) {
            clone[key] = { ...props[key] };
        }
        return clone;
    }
    
    // // Save tag properties to notebook metadata
    // private static saveTagProperties(notebook: vscode.NotebookDocument, properties: Record<string, TagProperties>): Thenable<boolean> {
    //     // Call updateNotebookMetadata with the proper path and value
    //     return updateNotebookMetadata(notebook, [this.METADATA_KEY], properties)
    //         .then(() => true)  // Convert void return to Thenable<boolean>
    //         .catch(error => {
    //             console.error('Error saving tag properties:', error);
    //             return false;
    //         });

    //     // const edit = new vscode.WorkspaceEdit();
    //     // const metadata = { ...notebook.metadata } || {};
    //     // metadata[this.METADATA_KEY] = properties;
        
    //     // edit.replaceNotebookMetadata(notebook.uri, metadata);
    //     // return vscode.workspace.applyEdit(edit);
    // }

    // Save tag properties to notebook metadata
    private static saveTagProperties(notebook: vscode.NotebookDocument, properties: Record<string, TagProperties>): Thenable<boolean> {
        // Call updateNotebookMetadata with the proper path and value
        return Promise.resolve(updateNotebookMetadata(notebook, [this.METADATA_KEY], properties))
            .then(() => true)  // Convert void return to Thenable<boolean>
            .catch(error => {
                console.error('Error saving tag properties:', error);
                return false;
            });
    }

}
