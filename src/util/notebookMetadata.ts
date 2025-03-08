import * as vscode from 'vscode';

/**
 * This should handle getting/setting/updating cell and notebook level metadata
 */


/**
 * Get arbitrary notebook metadata using a path array
 * @param notebook The notebook to retrieve metadata from
 * @param metadataPath Array representing the path to the metadata value
 * @param defaultValue Value to return if metadata doesn't exist
 * @returns The metadata value at the specified path or defaultValue if not found
 */
export function getNotebookMetadata<T>(notebook: vscode.NotebookDocument, metadataPath: string[], defaultValue: T): T {
    let current: any = notebook.metadata;
    
    // Navigate down the path
    for (const key of metadataPath) {
        if (current === undefined || current === null || typeof current !== 'object') {
            return defaultValue;
        }
        current = current[key];
    }
    
    return current !== undefined ? current : defaultValue;
}

/**
 * Update arbitrary notebook metadata using a path array
 * @param notebook The notebook to update
 * @param metadataPath Array representing the path to the metadata value
 * @param value New value to set at the specified path
 */
export function updateNotebookMetadata<T>(notebook: vscode.NotebookDocument, metadataPath: string[], value: T): void {
    // Clone the existing metadata
    const newMetadata = { ...(notebook.metadata || {}) };
    
    // We'll traverse the path and build the objects as needed
    let current = newMetadata;
    
    // For all but the last key in the path, ensure the objects exist
    for (let i = 0; i < metadataPath.length - 1; i++) {
        const key = metadataPath[i];
        current[key] = current[key] || {};
        current = current[key];
    }
    
    // Set the value at the final key
    const lastKey = metadataPath[metadataPath.length - 1];
    current[lastKey] = value;
    
    // Apply the edit
    const wsEdit = new vscode.WorkspaceEdit();
    const notebookEdit = vscode.NotebookEdit.updateNotebookMetadata(newMetadata);
    wsEdit.set(notebook.uri, [notebookEdit]);
    vscode.workspace.applyEdit(wsEdit);
}


/**
 * Get arbitrary cell metadata using a path array - inspired by `getCellRunGroupMetadata`
 * @param cell The notebook cell to retrieve metadata from
 * @param metadataPath Array representing the path to the metadata value
 * @param defaultValue Value to return if metadata doesn't exist
 * @returns The metadata value at the specified path or defaultValue if not found
 */
export function getCellMetadata<T>(cell: vscode.NotebookCell, metadataPath: string[], defaultValue: T): T {
    let current: any = cell.metadata;
    
    // Navigate down the path
    for (const key of metadataPath) {
        if (current === undefined || current === null || typeof current !== 'object') {
            return defaultValue;
        }
        current = current[key];
    }
    
    return current !== undefined ? current : defaultValue;
}

/**
 * Update arbitrary cell metadata using a path array - inspired by `updateCellRunGroupMetadata`
 * @param cell The notebook cell to update
 * @param metadataPath Array representing the path to the metadata value
 * @param value New value to set at the specified path
 */
export function updateCellMetadata<T>(cell: vscode.NotebookCell, metadataPath: string[], value: T): void {
    // Clone the existing metadata
    const newMetadata = { ...(cell.metadata || {}) };
    
    // We'll traverse the path and build the objects as needed
    let current = newMetadata;
    
    // For all but the last key in the path, ensure the objects exist
    for (let i = 0; i < metadataPath.length - 1; i++) {
        const key = metadataPath[i];
        current[key] = current[key] || {};
        current = current[key];
    }
    
    // Set the value at the final key
    const lastKey = metadataPath[metadataPath.length - 1];
    current[lastKey] = value;
    
    // Apply the edit
    const wsEdit = new vscode.WorkspaceEdit();
    const notebookEdit = vscode.NotebookEdit.updateCellMetadata(cell.index, newMetadata);
    wsEdit.set(cell.notebook.uri, [notebookEdit]);
    vscode.workspace.applyEdit(wsEdit);
}

