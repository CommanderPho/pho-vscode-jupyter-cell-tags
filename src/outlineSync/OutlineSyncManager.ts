// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IOutlineSyncManager, OutlineSyncConfig } from './IOutlineSyncManager';
import { log } from '../util/logging';

/**
 * Default configuration for outline synchronization
 */
const DEFAULT_CONFIG: OutlineSyncConfig = {
    enabled: true,
    debounceMs: 100,
    maxRetries: 3,
    retryDelayMs: 100
};

/**
 * Manages synchronization between notebook cell selections and the VS Code Outline pane.
 * Uses a focus-based approach to trigger outline updates when selections change programmatically.
 */
export class OutlineSyncManager implements IOutlineSyncManager {
    private config: OutlineSyncConfig;
    private disposables: vscode.Disposable[] = [];
    private syncInProgress: boolean = false;

    /**
     * Creates a new OutlineSyncManager
     * @param config Optional initial configuration
     */
    constructor(config?: Partial<OutlineSyncConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        log('OutlineSyncManager initialized with config:', this.config);
    }

    /**
     * Synchronize the Outline view with current selections using focus-based approach
     */
    public async syncOutline(editor: vscode.NotebookEditor): Promise<void> {
        // Check if synchronization is enabled
        if (!this.config.enabled) {
            log('Outline sync is disabled, skipping');
            return;
        }

        // Check if sync is already in progress
        if (this.syncInProgress) {
            log('Outline sync already in progress, skipping');
            return;
        }

        // Check if editor is valid
        if (!editor || editor.notebook.isClosed) {
            log('Editor is invalid or closed, skipping sync');
            return;
        }

        this.syncInProgress = true;

        try {
            await this.syncWithRetry(editor);
        } finally {
            this.syncInProgress = false;
        }
    }

    /**
     * Attempt synchronization with retry logic and exponential backoff
     */
    private async syncWithRetry(editor: vscode.NotebookEditor): Promise<void> {
        let lastError: Error | undefined;

        for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
            try {
                await this.performSync(editor);
                log(`Outline sync succeeded on attempt ${attempt + 1}`);
                return;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                log(`Outline sync attempt ${attempt + 1} failed: ${lastError.message}`);

                // If not the last attempt, wait before retrying with exponential backoff
                if (attempt < this.config.maxRetries - 1) {
                    const delay = this.config.retryDelayMs * Math.pow(2, attempt);
                    log(`Waiting ${delay}ms before retry...`);
                    await this.delay(delay);
                }
            }
        }

        // All retries failed
        log(`Outline sync failed after ${this.config.maxRetries} attempts: ${lastError?.message}`);
        throw lastError || new Error('Outline sync failed');
    }

    /**
     * Perform the actual synchronization using focus-based approach
     */
    private async performSync(editor: vscode.NotebookEditor): Promise<void> {
        // Verify editor is still valid
        if (!editor || editor.notebook.isClosed) {
            throw new Error('Editor is no longer valid');
        }

        // Check if the editor is the active editor
        const isActive = vscode.window.activeNotebookEditor === editor;
        if (!isActive) {
            log('Editor is not active, skipping sync');
            return;
        }

        try {
            // Focus-based approach: Refresh focus on the active editor group
            // This triggers VS Code's internal outline update mechanism
            await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
            
            // Small delay to allow VS Code to process the focus change
            await this.delay(10);
            
            log('Outline sync completed successfully');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to execute focus command: ${errorMessage}`);
        }
    }

    /**
     * Enable or disable automatic synchronization
     */
    public setEnabled(enabled: boolean): void {
        this.config.enabled = enabled;
        log(`Outline sync ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Get the current configuration
     */
    public getConfig(): OutlineSyncConfig {
        return { ...this.config };
    }

    /**
     * Update the configuration
     */
    public updateConfig(config: Partial<OutlineSyncConfig>): void {
        this.config = { ...this.config, ...config };
        log('Outline sync config updated:', this.config);
    }

    /**
     * Utility method to create a delay
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Dispose of all resources
     */
    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
        log('OutlineSyncManager disposed');
    }
}
