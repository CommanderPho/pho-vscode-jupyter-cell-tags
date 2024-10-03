// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import * as vscode from 'vscode';
import { log } from './util/logging';
import { executeGroup, argNotebookCell } from './util/cellActionHelpers';

// Register our commands for run groups
export function registerCommands(context: vscode.ExtensionContext) {
    // // Register add commands


    // Register execute commands
    context.subscriptions.push(
        vscode.commands.registerCommand('jupyter-cell-tags.executeRunGroup', async (args) => {
            const disposables: vscode.Disposable[] = [];
            try {
                const tag = await vscode.window.showInputBox({
                    placeHolder: 'Type existing cell tag group to be executed'
                });

                if (tag) {
                    executeGroup(tag, argNotebookCell(args));
                    // const cells = getAllCellsFromActiveNotebook();
                    // if (cells) {
                    //     cells.forEach(cell => {
                    //         console.log(`Cell at index ${cell.index}:`);
                    //         console.log(`Cell kind: ${cell.kind === vscode.NotebookCellKind.Code ? 'Code' : 'Markdown'}`);
                    //         console.log(`Cell content: ${cell.document.getText()}`);
                    //     });
                    //     // executeGroup(tag, argNotebookCell(args));
                    //     executeGroup(tag, cells);
                    // }
                }
                else {
                    log('no tag');
                }
            } finally {
                disposables.forEach(d => d.dispose());
            }
        })
    );

}



