import * as vscode from 'vscode';
import { IUpdateCoordinator } from './IUpdateCoordinator';
import { INotebookOutlineTreeDataProvider } from './INotebookOutlineTreeDataProvider';
import { OutlineItem } from './models';
import { log } from '../util/logging';

/**
 * Debounced update coordinator for the custom notebook outline view
 */
export class UpdateCoordinator implements IUpdateCoordinator {
    private debounceDelayMs: number;
    private updateTimer: NodeJS.Timeout | undefined;
    private pendingWhileHidden: boolean = false;

    constructor(
        private readonly treeView: vscode.TreeView<OutlineItem>,
        private readonly provider: INotebookOutlineTreeDataProvider,
        debounceDelayMs: number
    ) {
        this.debounceDelayMs = debounceDelayMs;

        // When the view becomes visible, apply any pending updates
        this.treeView.onDidChangeVisibility(e => {
            if (e.visible && this.pendingWhileHidden) {
                this.pendingWhileHidden = false;
                this.scheduleUpdate();
            }
        });
    }

    scheduleUpdate(): void {
        if (!this.isViewVisible()) {
            // Remember that an update is needed, but don't do work while hidden
            this.pendingWhileHidden = true;
            return;
        }

        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }

        this.updateTimer = setTimeout(() => {
            this.updateTimer = undefined;
            try {
                this.provider.refresh();
            } catch (error) {
                log(`Failed to refresh custom outline: ${error}`);
            }
        }, this.debounceDelayMs);
    }

    cancelPendingUpdates(): void {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
            this.updateTimer = undefined;
        }
        this.pendingWhileHidden = false;
    }

    isViewVisible(): boolean {
        return this.treeView.visible;
    }

    setDebounceDelay(delayMs: number): void {
        if (delayMs < 0) {
            throw new Error('Debounce delay must be non-negative');
        }
        this.debounceDelayMs = delayMs;
        log(`Custom outline update debounce set to ${delayMs}ms`);
    }
}
