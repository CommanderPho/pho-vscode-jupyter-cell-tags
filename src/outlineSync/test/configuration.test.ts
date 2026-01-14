/**
 * Configuration handling tests
 * 
 * Tests for reading and updating outline sync configuration from VS Code settings
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { OutlineSyncManager } from '../OutlineSyncManager';
import { SelectionChangeDetector } from '../SelectionChangeDetector';

suite('Configuration Handling', () => {
    let originalConfig: { enabled: boolean; debounceMs: number };

    suiteSetup(async () => {
        // Save original configuration
        const config = vscode.workspace.getConfiguration('jupyter-cell-tags.outlineSync');
        originalConfig = {
            enabled: config.get<boolean>('enabled', true),
            debounceMs: config.get<number>('debounceMs', 100)
        };
    });

    suiteTeardown(async () => {
        // Restore original configuration
        const config = vscode.workspace.getConfiguration('jupyter-cell-tags.outlineSync');
        await config.update('enabled', originalConfig.enabled, vscode.ConfigurationTarget.Global);
        await config.update('debounceMs', originalConfig.debounceMs, vscode.ConfigurationTarget.Global);
    });

    test('reads configuration from VS Code settings', async () => {
        const config = vscode.workspace.getConfiguration('jupyter-cell-tags.outlineSync');
        
        const enabled = config.get<boolean>('enabled');
        const debounceMs = config.get<number>('debounceMs');
        
        assert.strictEqual(typeof enabled, 'boolean', 'enabled should be a boolean');
        assert.strictEqual(typeof debounceMs, 'number', 'debounceMs should be a number');
    });

    test('OutlineSyncManager respects enabled configuration', () => {
        const manager = new OutlineSyncManager({ enabled: false });
        const config = manager.getConfig();
        
        assert.strictEqual(config.enabled, false, 'Manager should respect enabled=false');
        
        manager.dispose();
    });

    test('OutlineSyncManager respects debounceMs configuration', () => {
        const manager = new OutlineSyncManager({ debounceMs: 200 });
        const config = manager.getConfig();
        
        assert.strictEqual(config.debounceMs, 200, 'Manager should respect debounceMs=200');
        
        manager.dispose();
    });

    test('OutlineSyncManager can update configuration', () => {
        const manager = new OutlineSyncManager({ enabled: true, debounceMs: 100 });
        
        manager.updateConfig({ enabled: false });
        let config = manager.getConfig();
        assert.strictEqual(config.enabled, false, 'Should update enabled to false');
        assert.strictEqual(config.debounceMs, 100, 'Should preserve debounceMs');
        
        manager.updateConfig({ debounceMs: 250 });
        config = manager.getConfig();
        assert.strictEqual(config.enabled, false, 'Should preserve enabled');
        assert.strictEqual(config.debounceMs, 250, 'Should update debounceMs to 250');
        
        manager.dispose();
    });

    test('SelectionChangeDetector respects debounce delay', () => {
        const detector = new SelectionChangeDetector(150);
        
        assert.strictEqual(detector.getDebounceDelay(), 150, 'Should use configured debounce delay');
        
        detector.dispose();
    });

    test('SelectionChangeDetector can update debounce delay', () => {
        const detector = new SelectionChangeDetector(100);
        
        detector.setDebounceDelay(300);
        assert.strictEqual(detector.getDebounceDelay(), 300, 'Should update debounce delay to 300');
        
        detector.dispose();
    });

    test('configuration changes can be applied to existing instances', () => {
        const manager = new OutlineSyncManager({ enabled: true, debounceMs: 100 });
        const detector = new SelectionChangeDetector(100);
        
        // Simulate configuration change
        const newConfig = { enabled: false, debounceMs: 200 };
        
        manager.updateConfig(newConfig);
        detector.setDebounceDelay(newConfig.debounceMs);
        
        assert.strictEqual(manager.getConfig().enabled, false, 'Manager should be disabled');
        assert.strictEqual(manager.getConfig().debounceMs, 200, 'Manager debounce should be 200');
        assert.strictEqual(detector.getDebounceDelay(), 200, 'Detector debounce should be 200');
        
        manager.dispose();
        detector.dispose();
    });
});
