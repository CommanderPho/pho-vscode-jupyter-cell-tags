// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import * as vscode from 'vscode';
// import { log, showTimedInformationMessage } from '../notebookRunGroups/util/logging';
// const myChannel = vscode.window.createOutputChannel('MyLogger');

let myChannel: vscode.OutputChannel;

// Function for logging — no-op on hot paths unless debugPrint is enabled
export function log(...args: any[]) {
    if (!myChannel) {
        return;
    }
    const config = vscode.workspace.getConfiguration('jupyter-cell-tags');
    const debugPrintEnabled = config.get<boolean>('debugPrint', false);
    if (!debugPrintEnabled) {
        return;
    }
    const line = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
    console.log(...args);
    myChannel.appendLine(line);
}

export async function showTimedInformationMessage(message: string, timeout: number) {
    // Create the information message
    const messagePromise = vscode.window.showInformationMessage(message);
    // Create a timeout promise that resolves after a certain delay
    const timeoutPromise = new Promise<void>(resolve => {
        setTimeout(() => {
            resolve();
        }, timeout);
    });

    // Use Promise.race to resolve whichever promise comes first (message dismissal or timeout)
    await Promise.race([messagePromise, timeoutPromise]);
}

// export function showTimedErrorMessage(message: string, timeout: number) {
//     // Create the information message
//     const messagePromise = vscode.window.showErrorMessage(message);
//     // Create a timeout promise that resolves after a certain delay
//     const timeoutPromise = new Promise<void>(resolve => {
//         setTimeout(() => {
//             resolve();
//         }, timeout);
//     });

//     // Use Promise.race to resolve whichever promise comes first (message dismissal or timeout)
//     return Promise.race([messagePromise, timeoutPromise]).then(() => {
//         // The message will disappear after the timeout
//     });
// }


// // Usage example: Show the message for 3 seconds (3000 ms)
// showTimedInformationMessage(`Executing ${cellRefs.length} cells with tag: ${tag}`, 3000);

export function activateCustomLogging(context: vscode.ExtensionContext) {
    // must be called first before any logging
    myChannel = vscode.window.createOutputChannel('PhoLogger');
    // One-time activation line (not gated) so the channel exists; hot-path log() stays quiet unless debugPrint
    myChannel.appendLine('Extension activated.');
}
