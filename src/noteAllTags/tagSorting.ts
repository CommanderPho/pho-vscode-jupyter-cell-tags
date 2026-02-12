import * as vscode from 'vscode';
import { CellReference } from "./allNotebookTagsTreeDataProvider";

/**
 * Attempts to extract and parse a date from a tag name.
 * Supports various date formats including ISO dates (YYYY-MM-DD) and common variations.
 * 
 * @param tagName - The tag name to parse for dates.
 * @returns A Date object if a valid date is found, null otherwise.
 */
export function extractDateFromTag(tagName: string): Date | null {
    // Common date patterns to match:
    // - ISO format: YYYY-MM-DD, YYYY/MM/DD
    // - Common formats: MM-DD-YYYY, DD-MM-YYYY, etc.
    const datePatterns = [
        // ISO format: YYYY-MM-DD or YYYY/MM/DD
        /(\d{4})[/-](\d{1,2})[/-](\d{1,2})/,
        // US format: MM-DD-YYYY or MM/DD/YYYY
        /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/,
    ];
    
    for (const pattern of datePatterns) {
        const match = tagName.match(pattern);
        if (match) {
            let year: number, month: number, day: number;
            
            // ISO format (YYYY-MM-DD)
            if (match[1].length === 4) {
                year = parseInt(match[1], 10);
                month = parseInt(match[2], 10);
                day = parseInt(match[3], 10);
            } else {
                // Assume MM-DD-YYYY format
                month = parseInt(match[1], 10);
                day = parseInt(match[2], 10);
                year = parseInt(match[3], 10);
            }
            
            // Validate the date values
            if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
                // Create date (month is 0-indexed in JavaScript Date)
                const date = new Date(year, month - 1, day);
                
                // Verify the date is valid (handles invalid dates like Feb 30)
                if (date.getFullYear() === year && 
                    date.getMonth() === month - 1 && 
                    date.getDate() === day) {
                    return date;
                }
            }
        }
    }
    
    return null;
}

export enum TagSortOrder {
    Alphabetical = 'alphabetical',
    CreationDate = 'creation-date',
    ModificationDate = 'modification-date',
    Priority = 'priority',
    DetectedDatetimes = 'detected-datetimes'
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
        case TagSortOrder.DetectedDatetimes:
            sortedEntries.sort(([tagA, aRefs], [tagB, bRefs]) => {
                // Try to extract dates from both tags
                const dateA = extractDateFromTag(tagA);
                const dateB = extractDateFromTag(tagB);
                
                // If both have dates, sort by date (newest first)
                if (dateA && dateB) {
                    return dateB.getTime() - dateA.getTime();
                }
                
                // If only A has a date, it comes first
                if (dateA && !dateB) {
                    return -1;
                }
                
                // If only B has a date, it comes first
                if (!dateA && dateB) {
                    return 1;
                }
                
                // If neither has a date, sort by creation date (earliest cell index)
                // This uses the same logic as CreationDate sort order
                const minIndexA = Math.min(...aRefs.map(ref => ref.index));
                const minIndexB = Math.min(...bRefs.map(ref => ref.index));
                return minIndexA - minIndexB;
            });
            break;
    }
    return new Map(sortedEntries);
}
