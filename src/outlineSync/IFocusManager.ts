// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';

/**
 * Interface for managing editor focus to trigger outline updates
 */
export interface IFocusManager {
    /**
     * Refresh editor focus to trigger Outline update
     * @param editor The notebook editor to refresh focus for
     * @returns Promise that resolves when focus refresh is complete
     */
    refreshFocus(editor: vscode.NotebookEditor): Promise<void>;
    
    /**
     * Check if editor has focus
     * @param editor The notebook editor to check
     * @returns True if the editor has focus, false otherwise
     */
    hasFocus(editor: vscode.NotebookEditor): boolean;
}
