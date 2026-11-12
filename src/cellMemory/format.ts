/**
 * Format a byte count as a short human-readable size (KB / MB / GB).
 * Values are approximate kernel RSS; keep display compact.
 */
export function formatBytes(bytes: number | undefined): string {
	if (bytes === undefined || !Number.isFinite(bytes)) {
		return '?';
	}
	const abs = Math.abs(bytes);
	if (abs < 1024) {
		return `${Math.round(bytes)} B`;
	}
	if (abs < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}
	if (abs < 1024 * 1024 * 1024) {
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Format a signed delta for UI, e.g. `+12.4 MB (peak 48.0 MB)`.
 */
export function formatMemoryDelta(deltaBytes: number | undefined, peakBytes?: number): string {
	if (deltaBytes === undefined || !Number.isFinite(deltaBytes)) {
		return '';
	}
	const sign = deltaBytes > 0 ? '+' : '';
	const deltaText = `${sign}${formatBytes(deltaBytes)}`;
	if (peakBytes !== undefined && Number.isFinite(peakBytes)) {
		return `${deltaText} (peak ${formatBytes(peakBytes)})`;
	}
	return deltaText;
}

/**
 * Compact status-bar form, e.g. `Δ+12.4 MB`.
 */
export function formatMemoryDeltaCompact(deltaBytes: number | undefined): string {
	if (deltaBytes === undefined || !Number.isFinite(deltaBytes)) {
		return '';
	}
	const sign = deltaBytes > 0 ? '+' : '';
	return `Δ${sign}${formatBytes(deltaBytes)}`;
}
