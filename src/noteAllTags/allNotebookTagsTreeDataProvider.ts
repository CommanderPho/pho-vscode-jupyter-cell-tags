import * as vscode from 'vscode';
import { TagTreeItem } from './TagTreeItem'; // Import the custom TreeItem
import { getCellTags } from '../helper';  // Assuming this function fetches the tags for a cell
import { executeGroup, argNotebookCell } from '../notebookRunGroups/util/cellActionHelpers';
import { log, showTimedInformationMessage } from '../notebookRunGroups/util/logging';

interface CellReference {
    index: number;
    label: string;
}


export class AllTagsTreeDataProvider implements vscode.TreeDataProvider<string | CellReference> {
    private _onDidChangeTreeData: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event;

    private _tags: Map<string, CellReference[]> = new Map();  // Map from tag -> list of cell references
    private _disposables: vscode.Disposable[] = [];
    private _editorDisposables: vscode.Disposable[] = [];

    constructor() {
        this._tags = new Map();

        this._disposables.push(vscode.window.onDidChangeActiveNotebookEditor(e => {
            this.registerEditorListeners(e);
        }));

        if (vscode.window.activeNotebookEditor) {
            this.registerEditorListeners(vscode.window.activeNotebookEditor);
        }
    }

    private async registerEditorListeners(editor: vscode.NotebookEditor | undefined) {
        this._editorDisposables.forEach(d => d.dispose());

        if (!editor || editor.notebook.notebookType !== 'jupyter-notebook') {
            return;
        }

        await vscode.commands.executeCommand('setContext', 'jupyter:showAllTagsExplorer', true);

        this._editorDisposables.push(vscode.workspace.onDidChangeNotebookDocument(e => {
            this.updateTags(editor);
        }));
        this.updateTags(editor);
    }

    private async updateTags(editor: vscode.NotebookEditor | undefined) {
        if (!editor) {
            this._tags.clear();
            this._onDidChangeTreeData.fire();
            return;
        }

        this._tags.clear();
        for (let i = 0; i < editor.notebook.cellCount; i++) {
            const cell = editor.notebook.cellAt(i);
            if (!cell) {
                continue;
            }
            const tags = getCellTags(cell);
            tags.forEach(tag => {
                if (!this._tags.has(tag)) {
                    this._tags.set(tag, []); // Initialize the list of cell references for the tag
                }
                const cellRef: CellReference = { index: i, label: `Cell ${i + 1}` }; // this is where the label that appears in the tree view is set and could be customized
                this._tags.get(tag)?.push(cellRef);
            });
        }

        this._onDidChangeTreeData.fire();
    }

    // Get tree item for both tag and cell references
    getTreeItem(element: string | CellReference): vscode.TreeItem | Thenable<vscode.TreeItem> {
        if (typeof element === 'string') {
            // Tag node
            // Tag node
            const tagItem = new TagTreeItem(element, vscode.TreeItemCollapsibleState.Collapsed, element);
            return tagItem;
        } else {
            // Cell reference node -- the leaf nodes that say "Cell 65" or similar
            const cellItem = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
            // set the default command to jump to that cell index
            cellItem.command = {
                command: 'jupyter-cell-tags.openNotebookCell',
                title: 'Open Cell',
                arguments: [element.index]  // Pass the cell index to the command
            };
            cellItem.tooltip = `Jump to cell ${element.index + 1}`;
            return cellItem;
        }
    }

    // Get children for both tags and cells
    getChildren(element?: string | undefined): vscode.ProviderResult<(string | CellReference)[]> {
        if (!element) {
            // Return all tags
            return Array.from(this._tags.keys());
        } else {
            // Return the list of cells for a given tag
            return this._tags.get(element) || [];
        }
    }

    dispose() {
        this._editorDisposables.forEach(d => d.dispose());
        this._disposables.forEach(d => d.dispose());
    }


    /* ================================================================================================================== */
    /* User Actions                                                                                                       */
    /* ================================================================================================================== */
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getAllTags(): string[] {
        return Array.from(this._tags.keys());
    }

    /**
     * Returns the list of CellReference objects associated with a given tag.
     * @param tag The tag to retrieve cell references for.
     */
    getCellReferencesForTag(tag: string): CellReference[] | undefined {
        return this._tags.get(tag);
    }

}


export function register(context: vscode.ExtensionContext) {
    const treeDataProvider = new AllTagsTreeDataProvider();
    context.subscriptions.push(vscode.window.registerTreeDataProvider('all-notebook-tags-view', treeDataProvider));

    // Register a command to open and highlight a cell
    context.subscriptions.push(vscode.commands.registerCommand('jupyter-cell-tags.openNotebookCell', (cellIndex: number) => {
        const editor = vscode.window.activeNotebookEditor;
        if (editor) {
            const range = new vscode.NotebookRange(cellIndex, cellIndex + 1);
            editor.revealRange(range, vscode.NotebookEditorRevealType.Default);
            editor.selections = [new vscode.NotebookRange(cellIndex, cellIndex + 1)];  // Highlight the cell
        }
    }));

    // vscode.commands.registerCommand('jupyter-cell-tags.refreshEntry', () =>
    //     /// jupyter-cell-tags
    //     treeDataProvider.refresh()
    // );

    // Register a command to refresh the tree view
    context.subscriptions.push(vscode.commands.registerCommand('jupyter-cell-tags.refreshEntry', () =>
        treeDataProvider.refresh()
    ));

    // Register the new "Run Tag" command
    // context.subscriptions.push(vscode.commands.registerCommand('jupyter-cell-tags.runTag', (tag: string) => {
    //     vscode.window.showInformationMessage(`Running all cells with tag: ${tag}`);
    //     // Implement your run logic here, e.g., execute all cells with the given tag

    //     // Example: Iterate through the tags and execute associated cells
    //     // You might need to expose a method in AllTagsTreeDataProvider to get cell references for a tag
    //     // For simplicity, this example assumes access to _tags (not recommended for production)
    // }));


    // Register the new "Run Tag" command
    context.subscriptions.push(vscode.commands.registerCommand('jupyter-cell-tags.runTag', async (tag: string) => {
        // vscode.window.showInformationMessage(`Running all cells with tag: ${tag}`);
        // showTimedInformationMessage(`Running all cells with tag: ${tag}`, 1000);

        const editor = vscode.window.activeNotebookEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active notebook editor found.');
            return;
        }

        const cellRefs = treeDataProvider.getCellReferencesForTag(tag);
        if (!cellRefs || cellRefs.length === 0) {
            // vscode.window.showInformationMessage(`No cells found with tag: ${tag}`);
            showTimedInformationMessage(`No cells found with tag: ${tag}`, 3000);
            return;
        }



        for (const cellRef of cellRefs) {
            const cell = editor.notebook.cellAt(cellRef.index);
            if (cell) {
                // Execute the cell
                // await editor.notebook.executeCell(cell.index);
                // await editor.executeCell(cell.index);
                executeGroup(tag, cell);    // Execute the group of cells
            }
        }

        // vscode.window.showInformationMessage(`Executed ${cellRefs.length} cells with tag: ${tag}`);
        // vscode.window.showInformationMessage(`Executing ${cellRefs.length} cells with tag: ${tag}`);
        showTimedInformationMessage(`Executing ${cellRefs.length} cells with tag: ${tag}`, 3000);

    }));


    // Register the new "Select All Cells" command
    context.subscriptions.push(vscode.commands.registerCommand('jupyter-cell-tags.selectAllChildCells', async (tag: string) => {
        const editor = vscode.window.activeNotebookEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active notebook editor found.');
            return;
        }
        showTimedInformationMessage(`selectAllChildCells`, 3000);

        const cellRefs = treeDataProvider.getCellReferencesForTag(tag);
        if (!cellRefs || cellRefs.length === 0) {
            // vscode.window.showInformationMessage(`No cells found with tag: ${tag}`);
            showTimedInformationMessage(`No cells found with tag: ${tag}`, 3000);
            return;
        }

        // build up the new selections:
        const cellRanges: vscode.NotebookRange[] = [];
        for (const cellRef of cellRefs) {
            const cell = editor.notebook.cellAt(cellRef.index);
            if (cell) {
                // Create a NotebookRange for this cell and add it to the cellRanges array
                cellRanges.push(new vscode.NotebookRange(cellRef.index, cellRef.index + 1));
            }
        }

        // Append the new selections to the existing selections
        editor.selections = [...editor.selections, ...cellRanges];

        showTimedInformationMessage(`Selected ${cellRefs.length} cells with tag: ${tag}`, 3000);
    }));





}
