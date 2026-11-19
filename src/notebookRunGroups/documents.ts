// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import * as vscode from 'vscode';
import { disposeContextKeysScheduler, scheduleUpdateContextKeys, updateContextKeys } from './contextKeys';

export function registerDocuments(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.workspace.onDidOpenNotebookDocument(() => scheduleUpdateContextKeys()));
    context.subscriptions.push(vscode.window.onDidChangeActiveNotebookEditor(() => scheduleUpdateContextKeys()));
    context.subscriptions.push({ dispose: disposeContextKeysScheduler });

    // Initial sync (not debounced) so toolbar context is ready immediately
    updateContextKeys();
}
