import * as vscode from 'vscode';
import { Heading, OutlineItem, OutlineStructure } from './models';
import { INotebookOutlineTreeDataProvider } from './INotebookOutlineTreeDataProvider';
import { IHeadingParser } from './IHeadingParser';
import { log } from '../util/logging';

/**
 * TreeDataProvider implementation for the custom notebook outline view
 */
export class NotebookOutlineTreeDataProvider implements INotebookOutlineTreeDataProvider {
    private _onDidChangeTreeData: vscode.EventEmitter<OutlineItem | undefined | null | void> =
        new vscode.EventEmitter<OutlineItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<OutlineItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    private structure: OutlineStructure | undefined;
    private parentMap: Map<OutlineItem, OutlineItem | undefined> = new Map();
    private childrenMap: Map<OutlineItem, OutlineItem[]> = new Map();
    private selectedItems: OutlineItem[] = [];
    private visibleItems: Set<OutlineItem> = new Set();
    private filterText: string = '';

    constructor(private readonly headingParser: IHeadingParser) {}

    /** Refresh the outline view for the provided or active notebook */
    refresh(notebook?: vscode.NotebookDocument): void {
        const editor = vscode.window.activeNotebookEditor;
        const targetNotebook = notebook ?? editor?.notebook;

        if (!targetNotebook) {
            this.structure = {
                items: [],
                cellToItems: new Map(),
                itemToRange: new Map()
            };
            this.parentMap.clear();
            this.childrenMap.clear();
            this.visibleItems.clear();
            this._onDidChangeTreeData.fire();
            return;
        }

        try {
            const items = this.headingParser.extractNotebookHeadings(targetNotebook);

            const cellToItems = new Map<number, OutlineItem[]>();
            const itemToRange = new Map<OutlineItem, vscode.NotebookRange>();

            for (const item of items) {
                const list = cellToItems.get(item.cellIndex) ?? [];
                list.push(item);
                cellToItems.set(item.cellIndex, list);
                itemToRange.set(item, item.childCellRange);
            }

            this.structure = { items, cellToItems, itemToRange };
            this.buildHierarchy();
        } catch (error) {
            log(`Failed to refresh notebook outline: ${error}`);
            this.structure = {
                items: [],
                cellToItems: new Map(),
                itemToRange: new Map()
            };
            this.parentMap.clear();
            this.childrenMap.clear();
            this.visibleItems.clear();
        }

        this._onDidChangeTreeData.fire();
    }

    /** Build parent/child relationships from the flat list of outline items */
    private buildHierarchy(): void {
        this.parentMap.clear();
        this.childrenMap.clear();

        const items = this.structure?.items ?? [];
        const stack: OutlineItem[] = [];

        for (const item of items) {
            const level = item.heading.level;

            // Pop until we find a parent with lower level
            while (stack.length > 0 && stack[stack.length - 1].heading.level >= level) {
                stack.pop();
            }

            const parent = stack[stack.length - 1];
            this.parentMap.set(item, parent);

            if (parent) {
                const children = this.childrenMap.get(parent) ?? [];
                children.push(item);
                this.childrenMap.set(parent, children);
            }

            stack.push(item);
        }

        // Ensure all roots are represented even if they have no children
        for (const item of items) {
            if (!this.childrenMap.has(item)) {
                this.childrenMap.set(item, []);
            }
        }
    }

    getTreeItem(element: OutlineItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(element?: OutlineItem): vscode.ProviderResult<OutlineItem[]> {
        const items = this.structure?.items ?? [];
        if (!items.length) {
            return [];
        }

        // When filtering, show a flat list of matching items
        if (this.filterText && !element) {
            const filterLower = this.filterText.toLowerCase();
            return items.filter(item => 
                item.heading.text.toLowerCase().includes(filterLower)
            );
        }

        // If filtering is active and we're asked for children, return empty
        // (filtered view is flat)
        if (this.filterText && element) {
            return [];
        }

        if (!element) {
            // Root-level items: headings without parents
            const roots = items.filter(item => !this.parentMap.get(item));
            return roots;
        }

        return this.childrenMap.get(element) ?? [];
    }

    /** Get flat list of outline items for the active notebook */
    getOutlineItems(): OutlineItem[] {
        return this.structure?.items ?? [];
    }

    getSelectedItems(): OutlineItem[] {
        return this.selectedItems;
    }

    /** Track selected items based on cell indices (used by selection sync) */
    selectItems(cellIndices: number[]): void {
        const items = this.structure?.items ?? [];
        const indexSet = new Set(cellIndices);
        this.selectedItems = items.filter(item => indexSet.has(item.cellIndex));
    }

    /**
     * Update which outline items are currently in view in the notebook.
     * This is used to render a \"scroll bar\" style indicator in the outline.
     */
    updateVisibleItems(visibleItems: Set<OutlineItem>): void {
        const previous = this.visibleItems;
        this.visibleItems = visibleItems;

        // Clear \"in view\" state for items that are no longer visible
        for (const item of previous) {
            if (!visibleItems.has(item)) {
                item.setInView(false);
                this._onDidChangeTreeData.fire(item);
            }
        }

        // Mark new visible items
        for (const item of visibleItems) {
            if (!item.isInView()) {
                item.setInView(true);
                this._onDidChangeTreeData.fire(item);
            }
        }
    }

    /**
     * Set the filter text to filter displayed items.
     * Items matching the filter (case-insensitive) will be shown in a flat list.
     */
    setFilter(filterText: string): void {
        const newFilter = filterText.trim();
        if (newFilter !== this.filterText) {
            this.filterText = newFilter;
            this._onDidChangeTreeData.fire();
        }
    }

    /**
     * Get the current filter text.
     */
    getFilter(): string {
        return this.filterText;
    }

    /**
     * Clear the current filter.
     */
    clearFilter(): void {
        if (this.filterText) {
            this.filterText = '';
            this._onDidChangeTreeData.fire();
        }
    }
}
