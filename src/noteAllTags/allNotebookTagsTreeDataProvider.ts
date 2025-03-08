import * as vscode from 'vscode';
import { TagTreeItem } from './TagTreeItem'; // Import the custom TreeItem
import { CellTreeItem } from './CellTreeItem'; // Import the custom TreeItem
import { getCellTags } from '../helper';  // Assuming this function fetches the tags for a cell
import { executeGroup, executeNotebookCell } from '../notebookRunGroups/util/cellActionHelpers';
import { argNotebookCell } from '../util/notebookSelection';
import { log, showTimedInformationMessage } from '../util/logging';
import { TagSortOrder, sortTags } from './tagSorting';


export interface CellReference {
    index: number;
    label: string;
}


export class AllTagsTreeDataProvider implements vscode.TreeDataProvider<string | CellReference> {
    private _onDidChangeTreeData: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event;

    private _tags: Map<string, CellReference[]> = new Map();  // Map from tag -> list of cell references
    private _disposables: vscode.Disposable[] = [];
    private _editorDisposables: vscode.Disposable[] = [];
    private _sortOrder: TagSortOrder = TagSortOrder.Alphabetical;

    constructor() {
        this._tags = new Map();

        this._disposables.push(vscode.window.onDidChangeActiveNotebookEditor(e => {
            this.registerEditorListeners(e);
        }));

        if (vscode.window.activeNotebookEditor) {
            this.registerEditorListeners(vscode.window.activeNotebookEditor);
        }

        // Add configuration change listener
        this._disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('jupyter-cell-tags.tagSortOrder')) {
                    this._sortOrder = vscode.workspace.getConfiguration('jupyter-cell-tags').get('tagSortOrder') as TagSortOrder;
                    this._onDidChangeTreeData.fire();
                }
            })
        );
    }

    private async registerEditorListeners(editor: vscode.NotebookEditor | undefined) {
        this._editorDisposables.forEach(d => d.dispose());

        if (!editor || editor.notebook.notebookType !== 'jupyter-notebook') {
            return;
        }
        console.log('Setting jupyter:showAllTagsExplorer context');
        await vscode.commands.executeCommand('setContext', 'jupyter:showAllTagsExplorer', true);
        console.log('Context set');

        this._editorDisposables.push(vscode.workspace.onDidChangeNotebookDocument(e => {
            this.updateTags(editor);
        }));
        this.updateTags(editor);
    }

    public changeSortOrder() {
        const options = [
            { label: 'Alphabetical', value: TagSortOrder.Alphabetical },
            { label: 'Creation Date', value: TagSortOrder.CreationDate },
            { label: 'Modification Date', value: TagSortOrder.ModificationDate }
        ];

        vscode.window.showQuickPick(options, {
            placeHolder: 'Select tag sort order'
        }).then(selection => {
            if (selection) {
                this._sortOrder = selection.value;
                vscode.workspace.getConfiguration('jupyter-cell-tags').update('tagSortOrder', selection.value, true);
                this._onDidChangeTreeData.fire();
            }
        });
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
            const tagItem = new TagTreeItem(element, vscode.TreeItemCollapsibleState.Collapsed, element); // .contextValue = 'tagItem'
            return tagItem;
        } else {
            // Cell reference node -- the leaf nodes that say "Cell 65" or similar
            // const cellItem = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
            const cellItem = new CellTreeItem(element.label, vscode.TreeItemCollapsibleState.None, element);
            // set the default command to jump to that cell index
            cellItem.command = {
                command: 'jupyter-cell-tags.openNotebookCell',
                title: 'Open Cell',
                arguments: [element.index]  // Pass the cell index to the command
            };
            cellItem.tooltip = `Jump to cell ${element.index + 1}`;
            // Define multiple buttons by setting contextValue
            cellItem.contextValue = 'jupyterCellItem';
            // Add icon buttons
            cellItem.iconPath = new vscode.ThemeIcon('notebook');

            return cellItem;
        }
    }

    // Get children for both tags and cells
    public getChildren(element?: string | undefined): vscode.ProviderResult<(string | CellReference)[]> {
        if (!element) {
            // Return all tags
            const sortedTags = sortTags(this._tags, this._sortOrder);
            return Array.from(sortedTags.keys());
            // return Array.from(this._tags.keys());
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
    console.log('View registration started for all-notebook-tags-view');
    // Your view registration code
    console.log('View registration completed');

    // register the command to show the view
    context.subscriptions.push(
        vscode.commands.registerCommand('jupyter-cell-tags.showAllNotebookTags', () => {
            console.log('showAllNotebookTags command triggered');
            // Show the view in the explorer
            vscode.commands.executeCommand('workbench.view.explorer');
            console.log('Explorer view opened');
            // Focus/reveal the all-notebook-tags-view
            vscode.commands.executeCommand('all-notebook-tags-view.focus');
            console.log('Tried to focus all-notebook-tags-view');
        })
    );


    // Register a command to open and highlight a cell
    context.subscriptions.push(vscode.commands.registerCommand('jupyter-cell-tags.openNotebookCell', (cellIndex: number) => {
        const editor = vscode.window.activeNotebookEditor;
        if (editor) {
            const range = new vscode.NotebookRange(cellIndex, cellIndex + 1);
            editor.revealRange(range, vscode.NotebookEditorRevealType.AtTop);
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


    // Error running command jupyter-cell-tags.runCell: command 'jupyter-cell-tags.runCell' not found. This is likely caused by the extension that contributes jupyter-cell-tags.runCell.


    // Register the new "Run Cell" command
    // cellItem.command = {
    //     command: 'jupyter-cell-tags.openNotebookCell',
    //     title: 'Open Cell',
    //     arguments: [element.index]  // Pass the cell index to the command
    // };
    context.subscriptions.push(vscode.commands.registerCommand('jupyter-cell-tags.executeRunCell', (cellIndex: number) => {
        const editor = vscode.window.activeNotebookEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active notebook editor found.');
            return;
        }
        vscode.window.showErrorMessage('Pho -- executeRunCell not yet implemented.');
        // const cell = editor.notebook.cellAt(cellIndex);
        // if (!cell) {
        //     vscode.window.showErrorMessage(`Cell at index ${cellIndex} not found.`);
        //     return;
        // }

        // // Reveal and highlight the cell.
        // const range = new vscode.NotebookRange(cellIndex, cellIndex + 1);
        // editor.revealRange(range, vscode.NotebookEditorRevealType.AtTop);
        // editor.selections = [range];

        // try {
        //     // Execute the single cell.
        //     // Depending on your VS Code API version, one of the following methods should work:
        //     // await editor.notebook.executeCell(cell.index);
        //     // or
        //     // await editor.executeCell(cell.index);
        //     // Here we assume executeCell is available on notebook.
        //     // await editor.notebook.executeCell(cell.index);
        //     executeNotebookCell(cell)
        //     // await editor.executeCell(cell.index);

        //     showTimedInformationMessage(`Executed cell ${cellIndex + 1}`, 3000);
        // } catch (err) {
        //     vscode.window.showErrorMessage(`Error executing cell ${cellIndex + 1}: ${err}`);
        // }
    }));


    // context.subscriptions.push(
    //     vscode.commands.registerCommand('jupyter-cell-tags.executeRunGroup', async (args) => {
    //         // const tag = await quickPickAllTags();
    //         const tag = await quickPickAllRunGroupTags();
    //         if (tag) {
    //             executeGroup(tag, argNotebookCell(args));
    //             // await addCellTag(cell, [tag]);
    //             // log('executing tag', tag);
    //         }
    //         else {
    //             log('no tag');
    //         }
    //     })
    // );

    // context.subscriptions.push(vscode.commands.registerCommand('jupyter-cell-tags.runCell', async (cellIndex: number) => {
    //     const editor = vscode.window.activeNotebookEditor;
    //     if (!editor) {
    //         vscode.window.showErrorMessage('No active notebook editor found.');
    //         return;
    //     }

    //     const cell = editor.notebook.cellAt(cellIndex);
    //     if (!cell) {
    //         vscode.window.showErrorMessage(`Cell at index ${cellIndex} not found.`);
    //         return;
    //     }

    //     // Reveal and highlight the cell.
    //     const range = new vscode.NotebookRange(cellIndex, cellIndex + 1);
    //     editor.revealRange(range, vscode.NotebookEditorRevealType.AtTop);
    //     editor.selections = [range];

    //     try {
    //         // Execute the single cell.
    //         // Depending on your VS Code API version, one of the following methods should work:
    //         // await editor.notebook.executeCell(cell.index);
    //         // or
    //         // await editor.executeCell(cell.index);
    //         // Here we assume executeCell is available on notebook.
    //         // await editor.notebook.executeCell(cell.index);
    //         executeNotebookCell(cell)
    //         // await editor.executeCell(cell.index);

    //         showTimedInformationMessage(`Executed cell ${cellIndex + 1}`, 3000);
    //     } catch (err) {
    //         vscode.window.showErrorMessage(`Error executing cell ${cellIndex + 1}: ${err}`);
    //     }
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


    // Register the new "Select All Child Cells" command
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

        const existingSelections = new Set(editor.selections.map(sel => sel.start)); // Track existing start indices
        const cellRanges: vscode.NotebookRange[] = [];

        log(`existingSelections: ${existingSelections} containing ${existingSelections.entries.length} cells`);
        showTimedInformationMessage(`existingSelections: ${existingSelections} containing ${existingSelections.entries.length} cells`, 3000);

        for (const cellRef of cellRefs) {
            if ((cellRef.index >= 0) && (cellRef.index < editor.notebook.cellCount)) {
                const cell = editor.notebook.cellAt(cellRef.index);
                if (cell && !existingSelections.has(cellRef.index)) {

                    // log(`Adding cell at index ${cellRef.index} to selection`);
                    // showTimedInformationMessage(`Adding cell at index ${cellRef.index} to selection`, 1000);

                    // cellRanges.push(new vscode.NotebookRange(cellRef.index, cellRef.index));
                    cellRanges.push(new vscode.NotebookRange(cellRef.index, (cellRef.index + 1)));
                    // cellRanges.push(new vscode.NotebookRange(cellRef.index, (cellRef.index + 1)));
                }
            }
        }

        // Append new selections to the existing ones
        // editor.selections = [...editor.selections, ...cellRanges];
        // editor.selections = [...existingSelections, ...cellRanges];
        // // Reset selections to avoid unexpected behavior
        editor.selections = [...cellRanges];

        showTimedInformationMessage(`Selected ${cellRefs.length} cells with tag: ${tag}`, 3000);
    }));


    // Register the new "Select All Cells Under Tag" command:
    context.subscriptions.push(vscode.commands.registerCommand('jupyter-cell-tags.selectAllCellsUnderTag', async (tag: string) => {
        const editor = vscode.window.activeNotebookEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active notebook editor found.');
            return;
        }

        // Fetch cells with the given tag
        const cells = editor.notebook.getCells().filter(cell => {
            const tags = cell.metadata?.tags || [];
            return tags.includes(tag);
        });

        if (cells.length === 0) {
            vscode.window.showInformationMessage(`No cells found with tag: ${tag}`);
            return;
        }

        // Select all cells under the tag
        editor.selections = cells.map(cell => new vscode.NotebookRange(cell.index, cell.index + 1));
        vscode.window.showInformationMessage(`Selected ${cells.length} cells under tag: ${tag}`);
    }));


    context.subscriptions.push(
        vscode.commands.registerCommand('jupyter-cell-tags.changeSortOrder', () => {
            treeDataProvider.changeSortOrder();
        })
    );


}
