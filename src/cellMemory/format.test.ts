import * as assert from 'assert';
import { formatBytes, formatMemoryDelta, formatMemoryDeltaCompact } from './format';

suite('cellMemory format', () => {
	test('formatBytes handles B / KB / MB / GB', () => {
		assert.strictEqual(formatBytes(512), '512 B');
		assert.strictEqual(formatBytes(2048), '2.0 KB');
		assert.strictEqual(formatBytes(12.4 * 1024 * 1024), '12.4 MB');
		assert.strictEqual(formatBytes(2 * 1024 * 1024 * 1024), '2.00 GB');
	});

	test('formatBytes returns ? for invalid', () => {
		assert.strictEqual(formatBytes(undefined), '?');
		assert.strictEqual(formatBytes(Number.NaN), '?');
	});

	test('formatMemoryDelta includes sign and optional peak', () => {
		const delta = 12.4 * 1024 * 1024;
		const peak = 48 * 1024 * 1024;
		assert.strictEqual(formatMemoryDelta(delta, peak), '+12.4 MB (peak 48.0 MB)');
		assert.strictEqual(formatMemoryDelta(-1024), '-1.0 KB');
		assert.strictEqual(formatMemoryDelta(undefined), '');
	});

	test('formatMemoryDeltaCompact is short', () => {
		assert.strictEqual(formatMemoryDeltaCompact(12.4 * 1024 * 1024), 'Δ+12.4 MB');
		assert.strictEqual(formatMemoryDeltaCompact(-512), 'Δ-512 B');
		assert.strictEqual(formatMemoryDeltaCompact(undefined), '');
	});
});
