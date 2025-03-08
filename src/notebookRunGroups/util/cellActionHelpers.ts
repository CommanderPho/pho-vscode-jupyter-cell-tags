import * as vscode from 'vscode';
// import { getCellRunGroupMetadata, updateCellRunGroupMetadata } from './util/cellMetadataHelpers';
// import { updateContextKeys } from './contextKeys';
// import { RunGroup } from './enums';
import { log } from '../../util/logging';
import { getCellTags } from '../../helper';
// import path = require('path');
const path = require('path');
import { Jupyter, Kernel } from '@vscode/jupyter-extension';
import { getAllTagsFromActiveNotebook } from '../../util/notebookSelection';

// export async function quickPickSpecificTags(knownTagQuickPickItems?: { label: string }[], quickPickMessage?: string) {
//     const disposables: vscode.Disposable[] = [];
//     try {
//         const knownTags = (getAllTagsFromActiveNotebook() ?? []).flat().sort();
//         const knownTagsLowerCased = new Set(knownTags.map(tag => tag.toLowerCase()).filter(tag => tag.includes("run-")));
//         knownTagQuickPickItems = knownTagQuickPickItems ?? Array.from(knownTagsLowerCased).map(tag => ({ label: tag }));
//         const quickPick = vscode.window.createQuickPick();
//         disposables.push(quickPick);
//         quickPick.placeholder = quickPickMessage ?? 'Type to select or create a cell tag with "run-" prefix';
//         quickPick.items = knownTagQuickPickItems;
//         quickPick.show();

//         quickPick.onDidChangeValue(e => {
//             e = "run-" + e.trim().toLowerCase();
//             if (!e || knownTagsLowerCased.has(e)) {
//                 return;
//             }
//             quickPick.items = knownTagQuickPickItems.concat({ label: e }).sort();
//         }, undefined, disposables);

//         const tag = await new Promise<string>(resolve => {
//             quickPick.onDidHide(() => resolve(''), undefined, disposables);
//             quickPick.onDidAccept(() => {
//                 if (quickPick.selectedItems.length) {
//                     resolve(quickPick.selectedItems[0].label);
//                     quickPick.hide();
//                 }
//             }, undefined, disposables);
//         });
//         return tag;
//     }
//     finally {
//         disposables.forEach(d => d.dispose());
//     }
//     return null;
// }



export async function quickPickAllTags() {
	// const tag = await quickPickSpecificTags(undefined, "Type to select or create a cell tag with 'run-' prefix");

    const disposables: vscode.Disposable[] = [];
    try {
        // const knownTags = cell.notebook.getCells().map(cell => cell.metadata.custom?.metadata?.tags ?? []).flat().sort();
        const knownTags = (getAllTagsFromActiveNotebook() ?? []).flat().sort();
        const knownTagsLowerCased =  new Set(knownTags.map(tag => tag.toLowerCase()));
        const knownTagQuickPickItems = Array.from(new Set(knownTags)).map(tag => ({ label: tag }));
        const quickPick = vscode.window.createQuickPick();
        disposables.push(quickPick);
        quickPick.placeholder = 'Type to select or create a cell tag';
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
        // if (tag) {
        //     await addCellTag(cell, [tag]);
        // }
    }
    finally{
        disposables.forEach(d => d.dispose());
    }
    return null;
}


export function executeNotebookCell(notebookCell: vscode.NotebookCell) {
    if (!notebookCell) {
        log('executeCell called without a valid cell');
        return;
    }

    // Reveal the document if needed
    const notebook = notebookCell.notebook || vscode.window.activeNotebookEditor?.notebook;
    if (!notebook) {
        log('executeCell could not locate the notebook document');
        return;
    }

    const cellRange = { start: notebookCell.index, end: notebookCell.index + 1 };

    // Optionally log some details of the cell.
    log(`Executing cell at index ${notebookCell.index}`);
    log(`Cell kind: ${notebookCell.kind === vscode.NotebookCellKind.Code ? 'Code' : 'Markdown'}`);
    log(`Cell content: ${notebookCell.document.getText()}`);

    // Execute the single cell.
    vscode.commands.executeCommand('notebook.cell.execute', { ranges: [cellRange] });
    log('Done executing cell');
}




// Execute the given target run group. If a cell is specified use that document, if not find the active doc
export function executeGroup(targetRunTag: string, notebookCell?: vscode.NotebookCell) {
    let doc = notebookCell?.notebook; // get the document from the context cell
    // If we didn't get a cell passed in, just take the active documents
    if (!doc) {
        doc = vscode.window.activeNotebookEditor?.notebook;
        doc || log('Execute group called without a valid document to execute');
    }

    // Collect our cell indexes
    const targetCells = doc
        ?.getCells()
        .filter((notebookCell) => cellInGroup(notebookCell, targetRunTag))
        .map((cell) => {
            log(`Cell at index ${cell.index}:`);
            log(`Cell kind: ${cell.kind === vscode.NotebookCellKind.Code ? 'Code' : 'Markdown'}`);
            log(`Cell content: ${cell.document.getText()}`);
            return { start: cell.index, end: cell.index + 1 };
        });

    // log(targetCells);
    // Execute the cells
    vscode.commands.executeCommand('notebook.cell.execute', { ranges: targetCells });
    log('done executing');

}

// Determine if a cell is in a given run group
function cellInGroup(cell: vscode.NotebookCell, targetCellTag: string) {
    // const currentValue = getCellRunGroupMetadata(cell);
    const tags = getCellTags(cell);
    if (tags.includes(targetCellTag)) {
        return true;
    }
    return false;
}


/* ================================================================================================================== */
/* Jupyter Notebook Kerenel Execution                                                                                 */
/* ================================================================================================================== */
const ErrorMimeType = vscode.NotebookCellOutputItem.error(new Error('')).mime;
const StdOutMimeType = vscode.NotebookCellOutputItem.stdout('').mime;
const StdErrMimeType = vscode.NotebookCellOutputItem.stderr('').mime;
const MarkdownMimeType = 'text/markdown';
const HtmlMimeType = 'text/html';
const textDecoder = new TextDecoder();
export async function executeCode(kernel: Kernel, code: string, logger: vscode.OutputChannel) {
	logger.show();
	logger.appendLine(`>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>`);
	logger.appendLine(`Executing code against kernel ${code}`);
	const tokenSource = new vscode.CancellationTokenSource();
	try {
		for await (const output of kernel.executeCode(code, tokenSource.token)) {
			for (const outputItem of output.items) {
				if (outputItem.mime === ErrorMimeType) {
					const error = JSON.parse(textDecoder.decode(outputItem.data)) as Error;
					logger.appendLine(
						`Error executing code ${error.name}: ${error.message},/n ${error.stack}`
					);
				} else {
					logger.appendLine(
						`${outputItem.mime} Output: ${textDecoder.decode(outputItem.data)}`
					);
				}
			}
		}
		logger.appendLine('Code execution completed');
		logger.appendLine(`<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<`);
	} catch (ex){
		logger.appendLine(`Code execution failed with an error '${ex}'`);
		logger.appendLine(`<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<`);
	} finally {
		tokenSource.dispose();
	}
}

const printHelloWorld = `print('Hello World')`;
const throwAnError = `raise Exception('Hello World')`;
const displayMarkdown = `from IPython.display import display, Markdown
display(Markdown('*some markdown*'))`;
const displayHtml = `from IPython.display import display, HTML
display(HTML('<div>Hello World</div>'))`;
const printToStdErr = `import sys
print('Hello World', file=sys.stderr)`;
const streamOutput = `import time
for i in range(10):
	print(i)
	time.sleep(1)`;

const codeSnippets = new Map([
	['Print Hello World', printHelloWorld],
	['Stream Output', streamOutput],
	['Display Markdown', displayMarkdown],
	['Display HTML', displayHtml],
	['Print to StdErr', printToStdErr],
	['Throw an Error', throwAnError],
]);

export async function selectCodeToRunAgainstKernel() {
	const selection = await vscode.window.showQuickPick(Array.from(codeSnippets.keys()), {
		placeHolder: 'Select code to execute against the kernel',
	});
	if (!selection) {
		return;
	}
	return codeSnippets.get(selection);
}

export async function selectKernel(): Promise<Kernel | undefined> {
	const extension = vscode.extensions.getExtension<Jupyter>('ms-toolsai.jupyter');
	if (!extension) {
		throw new Error('Jupyter extension not installed');
	}
	await extension.activate();

	if (vscode.workspace.notebookDocuments.length === 0) {
		vscode.window.showErrorMessage(
			'No notebooks open. Open a notebook, run a cell and then try this command'
		);
		return;
	}
    const toDispose: vscode.Disposable[] = [];
	return new Promise<Kernel | undefined>((resolve) => {
		const quickPick = vscode.window.createQuickPick<vscode.QuickPickItem & { kernel: Kernel }>();
		toDispose.push(quickPick);
		const quickPickItems: (vscode.QuickPickItem & { kernel: Kernel })[] = [];
		quickPick.title = 'Select a Kernel';
		quickPick.placeholder = 'Select a Python Kernel to execute some code';
		quickPick.busy = true;
		quickPick.show();

		const api = extension.exports;
		Promise.all(
			vscode.workspace.notebookDocuments.map(async (document) => {
				const kernel = await api.kernels.getKernel(document.uri);
				if (kernel && (kernel as any).language === 'python') {
					quickPickItems.push({
						label: `Kernel for ${path.basename(document.uri.fsPath)}`,
						kernel,
					});
					quickPick.items = quickPickItems;
				}
			})
		).finally(() => {
			quickPick.busy = false;
			if (quickPickItems.length === 0) {
				quickPick.hide();
				vscode.window.showErrorMessage(
					'No active kernels associated with any of the open notebooks, try opening a notebook and running a Python cell'
				);
				return resolve(undefined);
			}
		});

		quickPick.onDidAccept(
			() => {
				quickPick.hide();
				if (quickPick.selectedItems.length > 0) {
					return resolve(quickPick.selectedItems[0].kernel);
				}
				resolve(undefined);
			},
			undefined,
			toDispose
		);
		quickPick.onDidHide(() => resolve(undefined), undefined, toDispose);
	}).finally(() => vscode.Disposable.from(...toDispose).dispose());
}

