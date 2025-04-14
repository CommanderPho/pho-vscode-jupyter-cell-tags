// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import * as vscode from 'vscode';
// import { log, showTimedInformationMessage } from '../notebookRunGroups/util/logging';
// const myChannel = vscode.window.createOutputChannel('MyLogger');

let myChannel: vscode.OutputChannel;

// Function for logging
export function log(...args: any[]) {
    // Might eventually go to output channel, but this is fine as a placeholder
    console.log(...args);
    myChannel.appendLine(args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' '));
    // showTimedInformationMessage(args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' '), 1000);
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
    myChannel.appendLine('Extension activated.');
    // myChannel.show(true);
    // myChannel.show(false);
    log('Extension activated.');

}
