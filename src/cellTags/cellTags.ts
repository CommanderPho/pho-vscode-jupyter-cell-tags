// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import * as json from '../json';
import { getCellTags, updateCellTags } from '../helper';
// import { getAllTagsFromActiveNotebook } from './allNotebookTagsTreeDataProvider';
import { quickPickAllTags } from '../notebookRunGroups/util/cellActionHelpers';
import { getAllTagsFromActiveNotebook, reviveCell } from '../util/notebookSelection';
import { getActiveCell, getActiveCells } from '../util/notebookSelection';


export async function addCellTag(cell: vscode.NotebookCell, tags: string[]) {
    const oldTags = getCellTags(cell);
    const newTags: string[] = [];
    for (const tag of tags) {
        if (!oldTags.includes(tag)) {
            newTags.push(tag);
        }
    }
    if (newTags.length) {
        oldTags.push(...newTags);
    }

    await updateCellTags(cell, oldTags);
}

export async function addTagsToMultipleCells(cells: vscode.NotebookCell[], tags: string[]) {
    for (const cell of cells) {
        await addCellTag(cell, tags);
    }
}

export class CellTagStatusBarProvider implements vscode.NotebookCellStatusBarItemProvider {
    provideCellStatusBarItems(
        cell: vscode.NotebookCell,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.NotebookCellStatusBarItem[]> {
        const items: vscode.NotebookCellStatusBarItem[] = [];
        getCellTags(cell).forEach((tag: string) => {
            items.push({
                text: '$(close) ' + tag,
                tooltip: tag,
                command: {
                    title: `Remove Tag ${tag}`,
                    command: 'jupyter-cell-tags.removeTag',
                    arguments: [cell, tag]
                },
                alignment: vscode.NotebookCellStatusBarAlignment.Left
            });
        });

        // if (items.length) { // require at least one item for the + tag button to show up
        // add insert tag status bar item
        items.push({
            text: '$(plus) Tag',
            tooltip: 'Add Tag',
            command: {
                title: 'Add Tag',
                command: 'jupyter-cell-tags.addTag',
                arguments: [cell]
            },
            alignment: vscode.NotebookCellStatusBarAlignment.Left
        });
        // }

        return items;
    }
}

export function register(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.notebooks.registerNotebookCellStatusBarItemProvider('jupyter-notebook', new CellTagStatusBarProvider())
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('jupyter-cell-tags.removeTag',
            async (cell: vscode.NotebookCell | string, tag: string) => {
                let activeCell: vscode.NotebookCell | undefined;
                if (typeof cell === 'string') {
                    // find active cell
                    activeCell = getActiveCell();
                    tag = cell;
                } else {
                    activeCell = cell;
                }

                if (!activeCell) {
                    return;
                }

                const tags = getCellTags(activeCell);
                // remove tag from tags
                const index = tags.indexOf(tag);
                if (index > -1) {
                    tags.splice(index, 1);
                    await updateCellTags(activeCell, tags);
                }
            }
        )
    );

    // Test getAllTagsFromActiveNotebook function
    const tags = getAllTagsFromActiveNotebook();
    console.log('Retrieved tags:', tags);

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'jupyter-cell-tags.addTag',
            async (cell: vscode.NotebookCell | vscode.Uri | undefined) => {
                cell = reviveCell(cell);
                if (!cell) {
                    return;
                }
                const tag = await quickPickAllTags();
                if (tag) {
                    await addCellTag(cell, [tag]);
                }


                // const disposables: vscode.Disposable[] = [];
                // try {
                //     // const knownTags = cell.notebook.getCells().map(cell => cell.metadata.custom?.metadata?.tags ?? []).flat().sort();
                //     // const knownTagsLowerCased =  new Set(knownTags.map(tag => tag.toLowerCase()));
                //     // const knownTagQuickPickItems = Array.from(new Set(knownTags)).map(tag => ({ label: tag }));
                //     // const quickPick = vscode.window.createQuickPick();
                //     // disposables.push(quickPick);
                //     // quickPick.placeholder = 'Type to select or create a cell tag';
                //     // quickPick.items = knownTagQuickPickItems;
                //     // quickPick.show();
                //     // quickPick.onDidChangeValue(e => {
                //     //     e = e.trim().toLowerCase();
                //     //     if (!e || knownTagsLowerCased.has(e)) {
                //     //         return;
                //     //     }
                //     //     quickPick.items = knownTagQuickPickItems.concat({ label: e }).sort();
                //     // }, undefined, disposables);
                //     // const tag = await new Promise<string>(resolve => {
                //     //     quickPick.onDidHide(() => resolve(''), undefined, disposables);
                //     //     quickPick.onDidAccept(() => {
                //     //         if (quickPick.selectedItems.length) {
                //     //             resolve(quickPick.selectedItems[0].label);
                //     //             quickPick.hide();
                //     //         }
                //     //     }, undefined, disposables);
                //     // });
                //     const tag = await quickPickAllTags();
                //     if (tag) {
                //         await addCellTag(cell, [tag]);
                //     }
                // }
                // finally{
                //     disposables.forEach(d => d.dispose());
                // }

            }
        )
    );

	context.subscriptions.push(vscode.commands.registerCommand('jupyter-cell-tags.addTagsToSelectedCells', async () => {
	    const activeCells = getActiveCells();
	    if (!activeCells) {
	        return;
	    }
        const tag = await quickPickAllTags();
        if (tag) {
            await addTagsToMultipleCells(activeCells, [tag]);
        }
	    // const disposables: vscode.Disposable[] = [];
	    // try {
		// 	const tag = await vscode.window.showInputBox({
		// 		placeHolder: 'Type to create a cell tag'
		// 	});

	    //     if (tag) {
	    //         await addTagsToMultipleCells(activeCells, [tag]);
	    //     }
	    // } finally {
	    //     disposables.forEach(d => d.dispose());
	    // }
	}));


    context.subscriptions.push(
        vscode.commands.registerCommand(
            'jupyter-cell-tags.paramaterize',
            async (cell: vscode.NotebookCell | vscode.Uri | undefined) => {
                cell = reviveCell(cell);
                if (!cell) {
                    return;
                }
                await addCellTag(cell, ['parameters']);
            }
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'jupyter-cell-tags.editTagsInJSON',
            async (cell: vscode.NotebookCell | vscode.Uri | undefined) => {
                cell = reviveCell(cell);
                if (!cell) {
                    return;
                }
                const resourceUri = cell.notebook.uri;
                const document = await vscode.workspace.openTextDocument(resourceUri);
                const tree = json.parseTree(document.getText());
                const cells = json.findNodeAtLocation(tree, ['cells']);
                if (cells && cells.children && cells.children[cell.index]) {
                    const cellNode = cells.children[cell.index];
                    const metadata = json.findNodeAtLocation(cellNode, ['metadata']);
                    if (metadata) {
                        const tags = json.findNodeAtLocation(metadata, ['tags']);
                        if (tags) {
                            const range = new vscode.Range(
                                document.positionAt(tags.offset),
                                document.positionAt(tags.offset + tags.length)
                            );
                            await vscode.window.showTextDocument(document, {
                                selection: range,
                                viewColumn: vscode.ViewColumn.Beside
                            });
                        } else {
                            const range = new vscode.Range(
                                document.positionAt(metadata.offset),
                                document.positionAt(metadata.offset + metadata.length)
                            );
                            await vscode.window.showTextDocument(document, {
                                selection: range,
                                viewColumn: vscode.ViewColumn.Beside
                            });
                        }
                    } else {
                        const range = new vscode.Range(
                            document.positionAt(cellNode.offset),
                            document.positionAt(cellNode.offset + cellNode.length)
                        );
                        await vscode.window.showTextDocument(document, {
                            selection: range,
                            viewColumn: vscode.ViewColumn.Beside
                        });
                    }
                }
            }
        )
    );
}
