import * as vscode from 'vscode';
import { NotebookTreeItem, OutlineItem, ExecutedCellLineItem, OutlineStructure } from './models';
import { INotebookOutlineTreeDataProvider } from './INotebookOutlineTreeDataProvider';
import { IHeadingParser } from './IHeadingParser';
import { log } from '../util/logging';
import { getExecutedCellsForCurrentSessionWithStatus } from '../cellExecution/cellExecutionTracking';

/**
 * TreeDataProvider implementation for the custom notebook outline view
 */
export class NotebookOutlineTreeDataProvider implements INotebookOutlineTreeDataProvider {
    private _onDidChangeTreeData: vscode.EventEmitter<NotebookTreeItem | undefined | null | void> =
        new vscode.EventEmitter<NotebookTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<NotebookTreeItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    private structure: OutlineStructure | undefined;
    private parentMap: Map<OutlineItem, OutlineItem | undefined> = new Map();
    private childrenMap: Map<OutlineItem, OutlineItem[]> = new Map();
    private selectedItems: OutlineItem[] = [];
    private visibleItems: Set<OutlineItem> = new Set();
    private filterText: string = '';
    private executedCellIndices: Set<number> = new Set();
    private showExecutedCells: boolean = false;
    private executedCellColor: string = '#FFFF0033';

    constructor(
        private readonly headingParser: IHeadingParser,
        private readonly context: vscode.ExtensionContext
    ) {
        this.readConfig();
    }

    private readConfig(): void {
        const config = vscode.workspace.getConfiguration('jupyter-cell-tags.customOutline');
        this.showExecutedCells = config.get<boolean>('showExecutedCells', false);
        this.executedCellColor = config.get<string>('executedCellColor', '#FFFF0033');
    }

    /** Refresh the outline view for the provided or active notebook */
    refresh(notebook?: vscode.NotebookDocument): void {
        this.readConfig();

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
            this.executedCellIndices.clear();
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

            // Load executed cells for the current session
            if (this.showExecutedCells && targetNotebook) {
                this.loadExecutedCells(targetNotebook);
            } else {
                this.executedCellIndices.clear();
            }
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
            this.executedCellIndices.clear();
        }

        this._onDidChangeTreeData.fire();
    }

    private loadExecutedCells(notebook: vscode.NotebookDocument): void {
        try {
            const executed = getExecutedCellsForCurrentSessionWithStatus(this.context, notebook.uri, notebook);
            this.executedCellIndices = new Set(executed.map(e => e.cellIndex));
        } catch (error) {
            log(`Failed to load executed cells for outline: ${error}`);
            this.executedCellIndices.clear();
        }
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

    getTreeItem(element: NotebookTreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(element?: NotebookTreeItem): vscode.ProviderResult<NotebookTreeItem[]> {
        const items = this.structure?.items ?? [];
        if (!items.length) {
            return [];
        }

        // When filtering, show a flat list of matching OutlineItem items (no indicators)
        if (this.filterText && !element) {
            const filterLower = this.filterText.toLowerCase();
            return items.filter(item => 
                item.heading.text.toLowerCase().includes(filterLower)
            );
        }

        // If filtering is active and we're asked for children, return empty
        if (this.filterText && element) {
            return [];
        }

        // ExecutedCellLineItem is a leaf
        if (element instanceof ExecutedCellLineItem) {
            return [];
        }

        if (!element) {
            // Root-level items: headings without parents
            const roots = items.filter(item => !this.parentMap.get(item));
            return roots;
        }

        // element is an OutlineItem: return child headings, optionally interleaved with executed cell indicators
        const elementItem = element as OutlineItem;
        const children = this.childrenMap.get(elementItem) ?? [];

        if (!this.showExecutedCells || this.executedCellIndices.size === 0) {
            return children;
        }

        return this.interleaveExecutedCells(elementItem, children);
    }

    /**
     * Merge child headings with executed cell indicators within the heading's range,
     * sorted by cell index. Excludes cells that are themselves heading cells.
     */
    private interleaveExecutedCells(
        heading: OutlineItem,
        children: OutlineItem[]
    ): NotebookTreeItem[] {
        const range = heading.childCellRange;
        const headingCells = new Set<number>([heading.cellIndex]);
        for (const child of children) {
            headingCells.add(child.cellIndex);
        }

        // Find executed cells within this heading's cell range, excluding heading cells
        const executedInRange = Array.from(this.executedCellIndices)
            .filter(idx => idx >= range.start && idx < range.end && !headingCells.has(idx))
            .sort((a, b) => a - b);

        if (executedInRange.length === 0) {
            return children;
        }

        // Merge children and executed cell indicators by cell index
        const result: NotebookTreeItem[] = [];
        let childIdx = 0;
        let execIdx = 0;

        while (childIdx < children.length || execIdx < executedInRange.length) {
            const child = childIdx < children.length ? children[childIdx] : null;
            const exec = execIdx < executedInRange.length ? executedInRange[execIdx] : null;

            if (child && (!exec || child.cellIndex <= exec)) {
                result.push(child);
                childIdx++;
            } else if (exec !== null) {
                result.push(new ExecutedCellLineItem(exec, this.executedCellColor));
                execIdx++;
            }
        }

        return result;
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
