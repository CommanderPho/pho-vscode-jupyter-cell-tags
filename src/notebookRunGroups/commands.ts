// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import * as vscode from 'vscode';
// import { getCellRunGroupMetadata, updateCellRunGroupMetadata } from './util/cellMetadataHelpers';
// import { updateContextKeys } from './contextKeys';
// import { RunGroup } from './enums';
import { log } from './util/logging';
import { executeGroup, argNotebookCell } from './util/cellActionHelpers';

// Register our commands for run groups
export function registerCommands(context: vscode.ExtensionContext) {
    // // Register add commands
    // context.subscriptions.push(
    //     vscode.commands.registerCommand('vscode-notebook-groups.addGroup1', (args) => {
    //         addToGroup(RunGroup.one, argNotebookCell(args));
    //     })
    // );
    // context.subscriptions.push(
    //     vscode.commands.registerCommand('vscode-notebook-groups.addGroup2', (args) => {
    //         addToGroup(RunGroup.two, argNotebookCell(args));
    //     })
    // );
    // context.subscriptions.push(
    //     vscode.commands.registerCommand('vscode-notebook-groups.addGroup3', (args) => {
    //         addToGroup(RunGroup.three, argNotebookCell(args));
    //     })
    // );

    // // Register remove commands
    // context.subscriptions.push(
    //     vscode.commands.registerCommand('vscode-notebook-groups.removeGroup1', (args) => {
    //         removeFromGroup(RunGroup.one, argNotebookCell(args));
    //     })
    // );
    // context.subscriptions.push(
    //     vscode.commands.registerCommand('vscode-notebook-groups.removeGroup2', (args) => {
    //         removeFromGroup(RunGroup.two, argNotebookCell(args));
    //     })
    // );
    // context.subscriptions.push(
    //     vscode.commands.registerCommand('vscode-notebook-groups.removeGroup3', (args) => {
    //         removeFromGroup(RunGroup.three, argNotebookCell(args));
    //     })
    // );

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
    // context.subscriptions.push(
    //     vscode.commands.registerCommand('vscode-notebook-groups.executeGroup2', (args) => {
    //         executeGroup(RunGroup.two, argNotebookCell(args));
    //     })
    // );
    // context.subscriptions.push(
    //     vscode.commands.registerCommand('vscode-notebook-groups.executeGroup3', (args) => {
    //         executeGroup(RunGroup.three, argNotebookCell(args));
    //     })
    // );
}



