import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { sortObjectPropertiesRecursively } from '../util/notebookMetadata';

export class SidecarManager {
    private static readonly SIDECAR_EXTENSION = '.vscode-metadata.json';
    
    /**
     * Get the sidecar file path for a given notebook
     */
    public static getSidecarPath(notebookUri: vscode.Uri): string {
        return notebookUri.fsPath + this.SIDECAR_EXTENSION;
    }
    
    /**
     * Load metadata from sidecar file
     */
    public static loadFromSidecar(notebookUri: vscode.Uri): any {
        const sidecarPath = this.getSidecarPath(notebookUri);
        
        try {
            if (fs.existsSync(sidecarPath)) {
                const content = fs.readFileSync(sidecarPath, 'utf8');
                return JSON.parse(content);
            }
        } catch (error) {
            console.error('Error loading sidecar file:', error);
        }
        
        return {};
    }
    
    /**
     * Save metadata to sidecar file
     */
    public static saveToSidecar(notebookUri: vscode.Uri, data: any): Thenable<boolean> {
        return new Promise((resolve) => {
            try {
                const sidecarPath = this.getSidecarPath(notebookUri);
                // Sort properties for consistent serialization
                const sortedData = sortObjectPropertiesRecursively(data);
                const content = JSON.stringify(sortedData, null, 2);
                
                fs.writeFileSync(sidecarPath, content, 'utf8');
                resolve(true);
            } catch (error) {
                console.error('Error saving sidecar file:', error);
                resolve(false);
            }
        });
    }
    
    /**
     * Update specific metadata in the sidecar file
     */
    public static updateSidecarMetadata<T>(notebookUri: vscode.Uri, metadataPath: string[], value: T): Thenable<boolean> {
        const data = this.loadFromSidecar(notebookUri);
        
        // Clone the existing metadata
        const newData = { ...data };
        
        // Traverse the path and build objects as needed
        let current = newData;
        
        // For all but the last key in the path, ensure objects exist
        for (let i = 0; i < metadataPath.length - 1; i++) {
            const key = metadataPath[i];
            current[key] = current[key] || {};
            current = current[key];
        }
        
        // Set the value at the final key
        const lastKey = metadataPath[metadataPath.length - 1];
        current[lastKey] = value;
        
        // Save the updated data
        return this.saveToSidecar(notebookUri, newData);
    }
    
    /**
     * Delete the sidecar file
     */
    public static deleteSidecar(notebookUri: vscode.Uri): Thenable<boolean> {
        return new Promise((resolve) => {
            try {
                const sidecarPath = this.getSidecarPath(notebookUri);
                if (fs.existsSync(sidecarPath)) {
                    fs.unlinkSync(sidecarPath);
                }
                resolve(true);
            } catch (error) {
                console.error('Error deleting sidecar file:', error);
                resolve(false);
            }
        });
    }
}
