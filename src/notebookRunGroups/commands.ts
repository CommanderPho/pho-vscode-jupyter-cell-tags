// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import * as vscode from 'vscode';
import { log } from './util/logging';
import { executeGroup, argNotebookCell, quickPickAllTags, getAllTagsFromActiveNotebook, selectKernel, selectCodeToRunAgainstKernel, executeCode } from './util/cellActionHelpers';
import { Jupyter, Kernel } from '@vscode/jupyter-extension';

export async function quickPickAllRunGroupTags() {
	// const knownTags = (getAllTagsFromActiveNotebook() ?? []).flat().sort();
	// // const knownTagsLowerCased =  new Set(knownTags.map(tag => tag.toLowerCase()));
	// const knownTagsLowerCased = new Set(knownTags.map(tag => tag.toLowerCase()).filter(tag => tag.includes("run-")));
	// const knownTagQuickPickItems = Array.from(new Set(knownTags)).map(tag => ({ label: tag }));
	// return await quickPickSpecificTags(knownTagQuickPickItems, "Type to selct a cell tag with 'run-' prefix");

    const disposables: vscode.Disposable[] = [];
    try {
        // const knownTags = cell.notebook.getCells().map(cell => cell.metadata.custom?.metadata?.tags ?? []).flat().sort();
        const knownTags = (getAllTagsFromActiveNotebook() ?? []).flat().sort()
        const filteredKnownTags = knownTags.filter(tag => tag.toLowerCase().includes("run"));
        //  || tag.includes("Run")) && !tag.includes("run-")
        const filteredOtherTags = knownTags.filter(tag => !tag.toLowerCase().includes("run"));
        const activeKnownTags = filteredKnownTags.concat(filteredOtherTags);
        const knownTagsLowerCased =  new Set(activeKnownTags.map(tag => tag.toLowerCase()));
        const knownTagQuickPickItems = Array.from(new Set(activeKnownTags)).map(tag => ({ label: tag }));
        const quickPick = vscode.window.createQuickPick();
        disposables.push(quickPick);
        quickPick.placeholder = 'Type to select a cell run tag';
        quickPick.items = knownTagQuickPickItems;
        quickPick.show();
        quickPick.onDidChangeValue(e => {
            e = e.trim().toLowerCase();
            if (!e || knownTagsLowerCased.has(e)) {
                return;
            }
            quickPick.items = knownTagQuickPickItems.concat({ label: e }).sort();
        }, undefined, disposables);
        const tag = await new Promise<string>(resolve => {
            quickPick.onDidHide(() => resolve(''), undefined, disposables);
            quickPick.onDidAccept(() => {
                if (quickPick.selectedItems.length) {
                    resolve(quickPick.selectedItems[0].label);
                    quickPick.hide();
                }
            }, undefined, disposables);
        });
        return tag;
    }
    finally{
        disposables.forEach(d => d.dispose());
    }
    return null;
}


// Register our commands for run groups
export function registerCommands(context: vscode.ExtensionContext) {
    // // Register add commands

    // Register execute commands
    context.subscriptions.push(
        vscode.commands.registerCommand('jupyter-cell-tags.executeRunGroup', async (args) => {
            // const tag = await quickPickAllTags();
            const tag = await quickPickAllRunGroupTags();
            if (tag) {
                executeGroup(tag, argNotebookCell(args));
                // await addCellTag(cell, [tag]);
                // log('executing tag', tag);
            }
            else {
                log('no tag');
            }
        })
    );

    const jupyterExt = vscode.extensions.getExtension<Jupyter>('ms-toolsai.jupyter');
	if (!jupyterExt) {
		throw new Error('Jupyter Extension not installed');
	}
	if (!jupyterExt.isActive) {
		jupyterExt.activate();
	}
	const output = vscode.window.createOutputChannel('Jupyter Kernel Execution');
	context.subscriptions.push(output);
	context.subscriptions.push(
		vscode.commands.registerCommand('jupyterKernelExecution.listKernels', async () => {
			const kernel = await selectKernel();
			if (!kernel) {
				return;
			}
			const code = await selectCodeToRunAgainstKernel();
			if (!code) {
				return;
			}
			await executeCode(kernel, code, output);
		})
	);


}



