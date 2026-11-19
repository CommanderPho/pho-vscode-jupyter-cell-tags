/**
 * Pure metadata helpers (no vscode import) so they can be unit-tested in Node.
 */

/**
 * Sort the JSON to minimize unnecessary SCM changes.
 * Jupyter notebooks/labs sorts the JSON keys in alphabetical order.
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
 * Deep-equality for notebook/cell metadata via stable JSON.
 * Used to skip WorkspaceEdit when a write would not change content —
 * applyEdit always marks the notebook dirty even for identical metadata.
 */
export function metadataDeepEqual(a: unknown, b: unknown): boolean {
    try {
        return JSON.stringify(sortObjectPropertiesRecursively(a ?? {})) ===
            JSON.stringify(sortObjectPropertiesRecursively(b ?? {}));
    } catch {
        return false;
    }
}
