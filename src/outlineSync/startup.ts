// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { OutlineSyncManager } from './OutlineSyncManager';
import { SelectionChangeDetector } from './SelectionChangeDetector';
import { OutlineSyncConfig } from './IOutlineSyncManager';
import { log } from '../util/logging';

/**
 * Global instances of the outline sync components
 */
let syncManager: OutlineSyncManager | undefined;
let selectionDetector: SelectionChangeDetector | undefined;

/**
 * Read outline sync configuration from VS Code settings
 */
function readConfiguration(): Partial<OutlineSyncConfig> {
    const config = vscode.workspace.getConfiguration('jupyter-cell-tags.outlineSync');
    
    const enabled = config.get<boolean>('enabled', true);
    const debounceMs = config.get<number>('debounceMs', 100);
    
    log(`Configuration read: enabled=${enabled}, debounceMs=${debounceMs}`);
    
    return {
        enabled,
        debounceMs
    };
}

/**
 * Update the sync manager and selection detector with new configuration
 */
function updateConfiguration(config: Partial<OutlineSyncConfig>): void {
    if (syncManager) {
        syncManager.updateConfig(config);
    }
    
    if (selectionDetector && config.debounceMs !== undefined) {
        selectionDetector.setDebounceDelay(config.debounceMs);
    }
    
    log('Configuration updated in outline sync components');
}

/**
 * Register and activate outline synchronization
 */
export function activateOutlineSync(context: vscode.ExtensionContext): void {
    log('Activating outline synchronization...');
    
    // Read initial configuration
    const initialConfig = readConfiguration();
    
    // Create selection detector with configured debounce delay
    selectionDetector = new SelectionChangeDetector(initialConfig.debounceMs);
    context.subscriptions.push(selectionDetector);
    
    // Create sync manager with initial configuration
    syncManager = new OutlineSyncManager(initialConfig);
    context.subscriptions.push(syncManager);
    
    // Register selection change handler
    const selectionChangeDisposable = selectionDetector.onSelectionChange(
        async (editor, selections) => {
            if (syncManager) {
                await syncManager.syncOutline(editor);
            }
        }
    );
    context.subscriptions.push(selectionChangeDisposable);
    
    // Listen for configuration changes
    const configChangeDisposable = vscode.workspace.onDidChangeConfiguration((event) => {
        // Check if our configuration changed
        if (event.affectsConfiguration('jupyter-cell-tags.outlineSync')) {
            log('Outline sync configuration changed, updating...');
            const newConfig = readConfiguration();
            updateConfiguration(newConfig);
        }
    });
    context.subscriptions.push(configChangeDisposable);
    
    log('Outline synchronization activated successfully');
}

/**
 * Get the current sync manager instance (for testing or external use)
 */
export function getSyncManager(): OutlineSyncManager | undefined {
    return syncManager;
}

/**
 * Get the current selection detector instance (for testing or external use)
 */
export function getSelectionDetector(): SelectionChangeDetector | undefined {
    return selectionDetector;
}
