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
}

export function deactivate() {}
