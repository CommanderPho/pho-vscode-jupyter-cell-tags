// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';

/**
 * Configuration options for outline synchronization
 */
export interface OutlineSyncConfig {
    /** Enable/disable synchronization */
    enabled: boolean;
    
    /** Debounce delay in milliseconds */
    debounceMs: number;
    
    /** Maximum retries for sync attempts */
    maxRetries: number;
    
    /** Retry delay in milliseconds */
    retryDelayMs: number;
}

/**
 * Interface for managing outline pane synchronization with notebook cell selections
 */
export interface IOutlineSyncManager {
    /**
     * Synchronize the Outline view with current selections
     * @param editor The notebook editor to synchronize
     * @returns Promise that resolves when synchronization is complete
     */
    syncOutline(editor: vscode.NotebookEditor): Promise<void>;
    
    /**
     * Enable or disable automatic synchronization
     * @param enabled Whether synchronization should be enabled
     */
    setEnabled(enabled: boolean): void;
    
    /**
     * Get the current configuration
     * @returns The current sync configuration
     */
    getConfig(): OutlineSyncConfig;
    
    /**
     * Update the configuration
     * @param config Partial configuration to update
     */
    updateConfig(config: Partial<OutlineSyncConfig>): void;
    
    /**
     * Dispose of all resources
     */
    dispose(): void;
}
