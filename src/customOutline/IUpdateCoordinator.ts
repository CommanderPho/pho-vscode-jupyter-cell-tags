/**
 * Coordinates debounced updates for the custom notebook outline view
 */
export interface IUpdateCoordinator {
    /** Schedule an outline update (debounced) */
    scheduleUpdate(): void;

    /** Cancel any pending outline updates */
    cancelPendingUpdates(): void;

    /** Check if the custom outline view is currently visible */
    isViewVisible(): boolean;

    /** Update debounce delay at runtime */
    setDebounceDelay(delayMs: number): void;
}
