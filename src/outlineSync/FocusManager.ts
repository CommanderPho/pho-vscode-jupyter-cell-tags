// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IFocusManager } from './IFocusManager';
import { log } from '../util/logging';

/**
 * Manages editor focus operations to trigger outline updates.
 * Implements focus state detection and focus refresh using VS Code commands.
 */
export class FocusManager implements IFocusManager {
    private static readonly FOCUS_COMMAND = 'workbench.action.focusActiveEditorGroup';
    private static readonly FOCUS_TIMEOUT_MS = 1000;
    private static readonly FOCUS_SETTLE_DELAY_MS = 10;

    /**
     * Refresh editor focus to trigger Outline update
     * @param editor The notebook editor to refresh focus for
     * @returns Promise that resolves when focus refresh is complete
     * @throws Error if focus operation fails or times out
     */
    public async refreshFocus(editor: vscode.NotebookEditor): Promise<void> {
        // Validate editor
        if (!editor || editor.notebook.isClosed) {
            const error = new Error('Cannot refresh focus: editor is invalid or closed');
            log(`Focus refresh failed: ${error.message}`);
            throw error;
        }

        // Check if editor is active
        if (!this.hasFocus(editor)) {
            const error = new Error('Cannot refresh focus: editor is not active');
            log(`Focus refresh failed: ${error.message}`);
            throw error;
        }

        try {
            log(`Refreshing focus for editor: ${editor.notebook.uri.toString()}`);
            
            // Execute focus command with timeout
            await this.executeWithTimeout(
                Promise.resolve(vscode.commands.executeCommand(FocusManager.FOCUS_COMMAND)),
                FocusManager.FOCUS_TIMEOUT_MS,
                'Focus command timed out'
            );
            
            // Allow a small delay for VS Code to process the focus change
            await this.delay(FocusManager.FOCUS_SETTLE_DELAY_MS);
            
            log('Focus refresh completed successfully');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const focusError = new Error(`Focus operation failed: ${errorMessage}`);
            log(`Focus refresh failed: ${focusError.message}`);
            throw focusError;
        }
    }

    /**
     * Check if editor has focus
     * @param editor The notebook editor to check
     * @returns True if the editor has focus, false otherwise
     */
    public hasFocus(editor: vscode.NotebookEditor): boolean {
        if (!editor || editor.notebook.isClosed) {
            log('Editor is invalid or closed, does not have focus');
            return false;
        }

        // Check if this editor is the active notebook editor
        const isActive = vscode.window.activeNotebookEditor === editor;
        
        log(`Editor focus check: ${isActive ? 'has focus' : 'does not have focus'}`);
        return isActive;
    }

    /**
     * Execute a promise with a timeout
     * @param promise The promise to execute
     * @param timeoutMs Timeout in milliseconds
     * @param timeoutMessage Error message if timeout occurs
     * @returns Promise that resolves with the original promise or rejects on timeout
     */
    private async executeWithTimeout<T>(
        promise: Promise<T>,
        timeoutMs: number,
        timeoutMessage: string
    ): Promise<T> {
        return Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
            })
        ]);
    }

    /**
     * Utility method to create a delay
     * @param ms Delay in milliseconds
     * @returns Promise that resolves after the delay
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
