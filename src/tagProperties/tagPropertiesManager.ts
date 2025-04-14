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
    
    // Get all tag properties from notebook metadata
    public static getAllTagProperties(notebook: vscode.NotebookDocument): Record<string, TagProperties> {
        const metadata = notebook.metadata || {};
        return metadata[this.METADATA_KEY] || {};
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
