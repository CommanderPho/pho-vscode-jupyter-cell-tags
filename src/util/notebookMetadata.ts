import * as vscode from 'vscode';

/**
 * This should handle getting/setting/updating cell and notebook level metadata
 */

export function useCustomMetadata() {
    if (vscode.extensions.getExtension('vscode.ipynb')?.exports.dropCustomMetadata) {
        return false;
    }
    return true;
}

/**
 * Sort the JSON to minimize unnecessary SCM changes.
 * Jupyter notbeooks/labs sorts the JSON keys in alphabetical order.
 * https://github.com/microsoft/vscode/issues/208137
 */
export function sortObjectPropertiesRecursively(obj: any): any {
    if (Array.isArray(obj)) {
        return obj.map(sortObjectPropertiesRecursively);
    }
    if (obj !== undefined && obj !== null && typeof obj === 'object' && Object.keys(obj).length > 0) {
        return (
            Object.keys(obj)
                .sort()
                .reduce<Record<string, any>>((sortedObj, prop) => {
                    sortedObj[prop] = sortObjectPropertiesRecursively(obj[prop]);
                    return sortedObj;
                }, {}) as any
        );
    }
    return obj;
}


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


export function getNotebookTags(notebook: vscode.NotebookDocument): string[] {
    const currentTags = (useCustomMetadata() ? notebook.metadata.custom?.metadata?.tags : notebook.metadata.metadata?.tags) ?? [];
    return [...currentTags];
}

export async function updateNotebookTags(notebook: vscode.NotebookDocument, tags: string[], defer_apply: boolean = false) {
    const metadata = JSON.parse(JSON.stringify(notebook.metadata));
    if (useCustomMetadata()) {
        metadata.custom = metadata.custom || {};
        metadata.custom.metadata = metadata.custom.metadata || {};
        metadata.custom.metadata.tags = tags;
        if (tags.length === 0) {
            delete metadata.custom.metadata.tags;
        }
    } else {
        metadata.metadata = metadata.metadata || {};
        metadata.metadata.tags = tags;
        if (tags.length === 0) {
            delete metadata.metadata.tags;
        }
    }
    if (!defer_apply) {
        const edit = new vscode.WorkspaceEdit();
        const nbEdit = vscode.NotebookEdit.updateCellMetadata(cell.index, sortObjectPropertiesRecursively(metadata));
        edit.set(cell.notebook.uri, [nbEdit]);
        await vscode.workspace.applyEdit(edit);
    } else {
        const nbEdit = vscode.NotebookEdit.updateCellMetadata(cell.index, sortObjectPropertiesRecursively(metadata));
        return nbEdit;
    }
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

