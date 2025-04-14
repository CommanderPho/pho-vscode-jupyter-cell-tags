import * as vscode from 'vscode';
import { activateCustomLogging, log } from './util/logging';
import { notebookRangeToIndices, notebookRangesToIndices } from './util/notebookSelection';


export class CellSelectionsStatusBarItem {
    private statusBarItem: vscode.StatusBarItem;
    private disposables: vscode.Disposable[] = [];

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.registerEventListeners();
        this.update();
        this.statusBarItem.show();
    }

    private registerEventListeners() {
        // Update whenever the active notebook editor changes.
        this.disposables.push(
            vscode.window.onDidChangeActiveNotebookEditor(() => this.update())
        );
        // Update when the selection within a notebook editor changes.
        this.disposables.push(
            vscode.window.onDidChangeNotebookEditorSelection(() => this.update())
        );

        // // Update when the selection within a notebook editor changes.
        // this.disposables.push(
        //     vscode.window.onDidChangeNotebookEditorVisibleRanges(() => this.updateVisibleRanges())
        // );
        

        

    }


    // private updateVisibleRanges() {
    //     // This needs to be faster than update() as it happens any time the notebook is scrolled or adjusted
    //     const extension = vscode.extensions.getExtension('phohale.pho-vscode-jupyter-cell-tags');
    //     const pluginVersion = extension?.packageJSON.version || 'unknown';
    //     const vscodeVersion = vscode.version;

    //     let selectionIndicator = '';
    //     const activeNotebookEditor = vscode.window.activeNotebookEditor;
    //     if (activeNotebookEditor && activeNotebookEditor.selections && activeNotebookEditor.selections.length > 0) {
    //         // For this example, we assume each cell in the selection has an "index" property.
    //         // const selectedCellIds = activeNotebookEditor.selections.map(cell => cell.index).join(', ');
    //         const selectedCellIds = activeNotebookEditor.selections.map(range => range.start).join(', ');
    //         selectionIndicator = ` | Selected Cells: ${selectedCellIds}`;
    //     }

    //     this.statusBarItem.text = `$(heart) $(preview) VSCode: ${vscodeVersion} | Plugin: ${pluginVersion}${selectionIndicator}`;
    //     this.statusBarItem.tooltip = 'Jupyter Cell Tags Version Info';
    // }




    private update() {
        // const extension = vscode.extensions.getExtension('phohale.pho-vscode-jupyter-cell-tags');
        
        // const pluginVersion = extension?.packageJSON.version || 'unknown';
        // const vscodeVersion = vscode.version;
        log('CellSelectionsStatusBarItem.update()');
        let selectionIndicator = '';
        const activeNotebookEditor = vscode.window.activeNotebookEditor;
        if (activeNotebookEditor && activeNotebookEditor.selections && activeNotebookEditor.selections.length > 0) {
            // For this example, we assume each cell in the selection has an "index" property.
            const selectedCellIds = notebookRangesToIndices(activeNotebookEditor.selections).join(', ');
            selectionIndicator = `Selected Cells: ${selectedCellIds} (${activeNotebookEditor.selections.length} cells)`;
        }
        else {
            selectionIndicator = '<No Notebook Cell Selections>';
        }

        this.statusBarItem.text = `$(heart) $(preview) ${selectionIndicator}`;
        this.statusBarItem.tooltip = 'Jupyter Cell Tags Version Info';
    }

    public dispose() {
        this.disposables.forEach(d => d.dispose());
        this.statusBarItem.dispose();
    }
}
