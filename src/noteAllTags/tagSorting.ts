// import { CellReference } from './allNotebookTagsTreeDataProvider';

import { CellReference } from "./allNotebookTagsTreeDataProvider";


export enum TagSortOrder {
    Alphabetical = 'alphabetical',
    CreationDate = 'creation-date',
    ModificationDate = 'modification-date'
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
    }

    return new Map(sortedEntries);
}
