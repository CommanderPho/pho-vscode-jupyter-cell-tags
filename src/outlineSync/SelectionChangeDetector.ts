// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { ISelectionChangeDetector } from './ISelectionChangeDetector';
import { log } from '../util/logging';

/**
 * Tracks whether a selection change was triggered programmatically
 */
interface SelectionChangeContext {
    isProgrammatic: boolean;
    timestamp: number;
}

/**
 * Detects and tracks notebook cell selection changes, distinguishing between
 * programmatic and manual changes, with configurable debouncing.
 */
export class SelectionChangeDetector implements ISelectionChangeDetector {
    private disposables: vscode.Disposable[] = [];
    private callbacks: Array<(editor: vscode.NotebookEditor, selections: readonly vscode.NotebookRange[]) => void> = [];
    private debounceTimer: NodeJS.Timeout | undefined;
    private debounceDelayMs: number;
    private programmaticChangeFlag: boolean = false;
    private lastSelectionContext: Map<string, SelectionChangeContext> = new Map();

    /**
     * Creates a new SelectionChangeDetector
     * @param debounceDelayMs Delay in milliseconds for debouncing selection changes (default: 300ms)
     */
    constructor(debounceDelayMs: number = 300) {
        this.debounceDelayMs = debounceDelayMs;
        this.initialize();
    }

    /**
     * Initialize the detector by listening to VS Code selection change events
     */
    private initialize(): void {
        // Listen to notebook editor selection changes
        const selectionChangeDisposable = vscode.window.onDidChangeNotebookEditorSelection(
            (event) => this.handleSelectionChange(event)
        );
        this.disposables.push(selectionChangeDisposable);
        
        log('SelectionChangeDetector initialized');
    }

    /**
     * Handle selection change events from VS Code
     */
    private handleSelectionChange(event: vscode.NotebookEditorSelectionChangeEvent): void {
        const editor = event.notebookEditor;
        const selections = event.selections;
        
        // Determine if this change was programmatic
        const isProgrammatic = this.programmaticChangeFlag;
        
        // Store context for this editor
        const editorKey = editor.notebook.uri.toString();
        this.lastSelectionContext.set(editorKey, {
            isProgrammatic,
            timestamp: Date.now()
        });
        
        // Reset the programmatic flag after processing
        this.programmaticChangeFlag = false;
        
        log(`Selection change detected: ${selections.length} ranges, programmatic: ${isProgrammatic}`);
        
        // Trigger sync for all selection changes
        // The debouncing will help avoid issues with rapid changes during UI interactions
        this.debounceNotification(editor, selections);
    }

    /**
     * Debounce notifications to prevent excessive updates during rapid selection changes
     */
    private debounceNotification(editor: vscode.NotebookEditor, selections: readonly vscode.NotebookRange[]): void {
        // Clear any existing timer
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        
        // Set a new timer
        this.debounceTimer = setTimeout(() => {
            this.notifyCallbacks(editor, selections);
            this.debounceTimer = undefined;
        }, this.debounceDelayMs);
    }

    /**
     * Notify all registered callbacks of a selection change
     */
    private notifyCallbacks(editor: vscode.NotebookEditor, selections: readonly vscode.NotebookRange[]): void {
        for (const callback of this.callbacks) {
            try {
                callback(editor, selections);
            } catch (error) {
                log(`Error in selection change callback: ${error}`);
            }
        }
    }

    /**
     * Register a callback to be invoked when selections change
     */
    public onSelectionChange(
        callback: (editor: vscode.NotebookEditor, selections: readonly vscode.NotebookRange[]) => void
    ): vscode.Disposable {
        this.callbacks.push(callback);
        
        return new vscode.Disposable(() => {
            const index = this.callbacks.indexOf(callback);
            if (index >= 0) {
                this.callbacks.splice(index, 1);
            }
        });
    }

    /**
     * Manually trigger a selection change event (for programmatic changes)
     */
    public triggerSelectionChange(editor: vscode.NotebookEditor, selections: readonly vscode.NotebookRange[]): void {
        // Set the flag to indicate this is a programmatic change
        this.programmaticChangeFlag = true;
        
        // Update the editor's selections - this will trigger the onDidChangeNotebookEditorSelection event
        editor.selections = [...selections];
        
        log(`Programmatic selection change triggered: ${selections.length} ranges`);
    }

    /**
     * Get the debounce delay in milliseconds
     */
    public getDebounceDelay(): number {
        return this.debounceDelayMs;
    }

    /**
     * Set the debounce delay in milliseconds
     */
    public setDebounceDelay(delayMs: number): void {
        if (delayMs < 0) {
            throw new Error('Debounce delay must be non-negative');
        }
        this.debounceDelayMs = delayMs;
        log(`Debounce delay updated to ${delayMs}ms`);
    }

    /**
     * Check if the last selection change for an editor was programmatic
     */
    public isProgrammaticChange(editor: vscode.NotebookEditor): boolean {
        const editorKey = editor.notebook.uri.toString();
        const context = this.lastSelectionContext.get(editorKey);
        return context?.isProgrammatic ?? false;
    }

    /**
     * Dispose of all resources
     */
    public dispose(): void {
        // Clear any pending debounce timer
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = undefined;
        }
        
        // Dispose all event listeners
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
        
        // Clear callbacks
        this.callbacks = [];
        
        // Clear context
        this.lastSelectionContext.clear();
        
        log('SelectionChangeDetector disposed');
    }
}
