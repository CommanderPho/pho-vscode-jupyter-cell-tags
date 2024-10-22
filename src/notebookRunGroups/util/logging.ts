// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import * as vscode from 'vscode';
// import { log, showTimedInformationMessage } from '../notebookRunGroups/util/logging';


// Function for logging
export function log(message: string) {
    // Might eventually go to output channel, but this is fine as a placeholder
    console.log(message);
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

