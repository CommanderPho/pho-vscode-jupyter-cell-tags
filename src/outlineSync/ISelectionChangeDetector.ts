// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';

/**
 * Interface for detecting and tracking notebook cell selection changes
 */
export interface ISelectionChangeDetector {
    /**
     * Register a callback to be invoked when selections change
     * @param callback Function to call when selections change
     * @returns Disposable to unregister the callback
     */
    onSelectionChange(callback: (editor: vscode.NotebookEditor, selections: readonly vscode.NotebookRange[]) => void): vscode.Disposable;
    
    /**
     * Manually trigger a selection change event
     * @param editor The notebook editor
     * @param selections The new selections
     */
    triggerSelectionChange(editor: vscode.NotebookEditor, selections: readonly vscode.NotebookRange[]): void;
    
    /**
     * Dispose of all resources
     */
    dispose(): void;
}
