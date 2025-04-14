import * as vscode from 'vscode';
import { CellReference } from "./allNotebookTagsTreeDataProvider";


export enum TagSortOrder {
    Alphabetical = 'alphabetical',
    CreationDate = 'creation-date',
    ModificationDate = 'modification-date',
    Priority = 'priority'
}

/**
 * Sorts the provided tags based on the specified sort order.
 *
 * @param tags - A map of tags to their associated cell references.
 * @param sortOrder - The order in which to sort the tags.
 * @returns A new map with the tags sorted according to the specified order.
 */
export function sortTags(tags: Map<string, CellReference[]>, sortOrder: TagSortOrder): Map<string, CellReference[]> {
    const sortedEntries = Array.from(tags.entries());

    switch (sortOrder) {
        case TagSortOrder.Alphabetical:
            sortedEntries.sort(([a], [b]) => a.localeCompare(b));
            break;
        case TagSortOrder.CreationDate:
            sortedEntries.sort(([, aRefs], [, bRefs]) =>
                Math.min(...aRefs.map(ref => ref.index)) -
                Math.min(...bRefs.map(ref => ref.index))
            );
            break;
        case TagSortOrder.ModificationDate:
            sortedEntries.sort(([, aRefs], [, bRefs]) =>
                Math.max(...bRefs.map(ref => ref.index)) -
                Math.max(...aRefs.map(ref => ref.index))
            );
            break;
        case TagSortOrder.Priority:
            // Get the active notebook to access its metadata
            const activeNotebook = vscode.window.activeNotebookEditor?.notebook;
            if (activeNotebook) {
                const metadata = activeNotebook.metadata || {};
                const tagProperties = metadata['tagProperties'] || {};
                
                sortedEntries.sort(([tagA], [tagB]) => {
                    // Get priorities from metadata, default to MAX_VALUE if not set
                    const priorityA = tagProperties[tagA]?.priority ?? Number.MAX_VALUE;
                    const priorityB = tagProperties[tagB]?.priority ?? Number.MAX_VALUE;
                    
                    // If priorities are equal, fall back to alphabetical sorting
                    if (priorityA === priorityB) {
                        return tagA.localeCompare(tagB);
                    }
                    
                    // Lower priority values come first (higher priority)
                    return priorityA - priorityB;
                });
            } else {
                // If no active notebook, just sort alphabetically as fallback
                sortedEntries.sort(([a], [b]) => a.localeCompare(b));
            }
            break;
    }
    return new Map(sortedEntries);
}
