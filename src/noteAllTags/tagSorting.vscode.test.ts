/**
 * Tests for tag sorting functionality
 */

import * as assert from 'assert';
import { extractDateFromTag } from './tagSorting';

suite('Tag Sorting - Date Extraction', () => {
	test('extracts ISO date format YYYY-MM-DD', () => {
		const result = extractDateFromTag('🟢 active-2026-02-11');
		assert.ok(result instanceof Date, 'Should return a Date object');
		assert.strictEqual(result!.getFullYear(), 2026);
		assert.strictEqual(result!.getMonth(), 1);
		assert.strictEqual(result!.getDate(), 11);
	});

	test('extracts ISO date format YYYY/MM/DD', () => {
		const result = extractDateFromTag('task-2025/03/15');
		assert.ok(result instanceof Date);
		assert.strictEqual(result!.getFullYear(), 2025);
		assert.strictEqual(result!.getMonth(), 2);
		assert.strictEqual(result!.getDate(), 15);
	});

	test('extracts US date format MM-DD-YYYY', () => {
		const result = extractDateFromTag('project-12-31-2024');
		assert.ok(result instanceof Date);
		assert.strictEqual(result!.getFullYear(), 2024);
		assert.strictEqual(result!.getMonth(), 11);
		assert.strictEqual(result!.getDate(), 31);
	});

	test('returns null for tag without date', () => {
		assert.strictEqual(extractDateFromTag('no-date-here'), null);
	});

	test('returns null for tag with invalid date', () => {
		assert.strictEqual(extractDateFromTag('invalid-2026-13-45'), null);
	});

	test('handles emoji prefix correctly', () => {
		const result = extractDateFromTag('🔵 status-2026-01-20');
		assert.ok(result instanceof Date);
		assert.strictEqual(result!.getFullYear(), 2026);
		assert.strictEqual(result!.getMonth(), 0);
		assert.strictEqual(result!.getDate(), 20);
	});

	test('handles date at beginning of tag', () => {
		const result = extractDateFromTag('2026-02-12-meeting');
		assert.ok(result instanceof Date);
		assert.strictEqual(result!.getFullYear(), 2026);
		assert.strictEqual(result!.getMonth(), 1);
		assert.strictEqual(result!.getDate(), 12);
	});

	test('handles date at end of tag', () => {
		const result = extractDateFromTag('meeting-2026-02-12');
		assert.ok(result instanceof Date);
		assert.strictEqual(result!.getFullYear(), 2026);
		assert.strictEqual(result!.getMonth(), 1);
		assert.strictEqual(result!.getDate(), 12);
	});

	test('returns null for year out of range', () => {
		assert.strictEqual(extractDateFromTag('old-1800-01-01'), null);
		assert.strictEqual(extractDateFromTag('future-2150-01-01'), null);
	});

	test('validates February 29th on leap year', () => {
		assert.ok(extractDateFromTag('leap-2024-02-29') instanceof Date);
	});

	test('rejects February 30th', () => {
		assert.strictEqual(extractDateFromTag('invalid-2024-02-30'), null);
	});
});
