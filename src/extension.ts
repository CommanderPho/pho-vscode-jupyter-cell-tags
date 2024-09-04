// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';

// const myOutputChannel = vscode.window.createOutputChannel("Pho Hale Extension - Jupyter Cell Tags");
// myOutputChannel.appendLine("This is a log message from my extension");
// myOutputChannel.show(true);

import { register as registerCellTags } from './cellTags';
import { register as registerCellTagsView } from './cellTagsTreeDataProvider';

export function activate(context: vscode.ExtensionContext) {
	registerCellTags(context);
	registerCellTagsView(context);

    // Update context when the active editor or selection changes
    vscode.window.onDidChangeActiveNotebookEditor(updateContext);
    vscode.window.onDidChangeNotebookEditorSelection(updateContext);

}

function updateContext() {
    const editor = vscode.window.activeNotebookEditor;
    if (!editor) {
        vscode.commands.executeCommand('setContext', 'jupyter-cell-tags.singleCellSelected', false);
        vscode.commands.executeCommand('setContext', 'jupyter-cell-tags.multipleCellsSelected', false);
        return;
    }

    const selectionCount = editor.selections.length;
    vscode.commands.executeCommand('setContext', 'jupyter-cell-tags.singleCellSelected', selectionCount === 1);
    vscode.commands.executeCommand('setContext', 'jupyter-cell-tags.multipleCellsSelected', selectionCount > 1);
}

export function deactivate() {}
