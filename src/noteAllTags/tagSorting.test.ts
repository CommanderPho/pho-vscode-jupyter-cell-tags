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
        assert.strictEqual(result!.getMonth(), 1); // February is month 1 (0-indexed)
        assert.strictEqual(result!.getDate(), 11);
    });

    test('extracts ISO date format YYYY/MM/DD', () => {
        const result = extractDateFromTag('task-2025/03/15');
        assert.ok(result instanceof Date);
        assert.strictEqual(result!.getFullYear(), 2025);
        assert.strictEqual(result!.getMonth(), 2); // March
        assert.strictEqual(result!.getDate(), 15);
    });

    test('extracts US date format MM-DD-YYYY', () => {
        const result = extractDateFromTag('project-12-31-2024');
        assert.ok(result instanceof Date);
        assert.strictEqual(result!.getFullYear(), 2024);
        assert.strictEqual(result!.getMonth(), 11); // December
        assert.strictEqual(result!.getDate(), 31);
    });

    test('returns null for tag without date', () => {
        const result = extractDateFromTag('no-date-here');
        assert.strictEqual(result, null);
    });

    test('returns null for tag with invalid date', () => {
        const result = extractDateFromTag('invalid-2026-13-45'); // Invalid month and day
        assert.strictEqual(result, null);
    });

    test('handles emoji prefix correctly', () => {
        const result = extractDateFromTag('🔵 status-2026-01-20');
        assert.ok(result instanceof Date);
        assert.strictEqual(result!.getFullYear(), 2026);
        assert.strictEqual(result!.getMonth(), 0); // January
        assert.strictEqual(result!.getDate(), 20);
    });

    test('handles date at beginning of tag', () => {
        const result = extractDateFromTag('2026-02-12-meeting');
        assert.ok(result instanceof Date);
        assert.strictEqual(result!.getFullYear(), 2026);
        assert.strictEqual(result!.getMonth(), 1); // February
        assert.strictEqual(result!.getDate(), 12);
    });

    test('handles date at end of tag', () => {
        const result = extractDateFromTag('meeting-2026-02-12');
        assert.ok(result instanceof Date);
        assert.strictEqual(result!.getFullYear(), 2026);
        assert.strictEqual(result!.getMonth(), 1); // February
        assert.strictEqual(result!.getDate(), 12);
    });

    test('returns null for year out of range', () => {
        const result1 = extractDateFromTag('old-1800-01-01');
        assert.strictEqual(result1, null);
        
        const result2 = extractDateFromTag('future-2150-01-01');
        assert.strictEqual(result2, null);
    });

    test('validates February 29th on leap year', () => {
        const result = extractDateFromTag('leap-2024-02-29');
        assert.ok(result instanceof Date);
    });

    test('rejects February 30th', () => {
        const result = extractDateFromTag('invalid-2024-02-30');
        assert.strictEqual(result, null);
    });
});
