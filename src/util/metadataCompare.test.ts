import * as assert from 'assert';
import { metadataDeepEqual, sortObjectPropertiesRecursively } from './metadataCompare';

suite('metadataDeepEqual', () => {
	test('treats identical objects as equal', () => {
		assert.strictEqual(metadataDeepEqual({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } }), true);
	});

	test('ignores key order', () => {
		assert.strictEqual(metadataDeepEqual({ b: 1, a: 2 }, { a: 2, b: 1 }), true);
	});

	test('detects value differences', () => {
		assert.strictEqual(metadataDeepEqual({ a: 1 }, { a: 2 }), false);
	});

	test('treats undefined and empty object as equal', () => {
		assert.strictEqual(metadataDeepEqual(undefined, {}), true);
	});

	test('sortObjectPropertiesRecursively is stable for nested objects', () => {
		const sorted = sortObjectPropertiesRecursively({ z: { b: 1, a: 2 }, a: 0 });
		assert.deepStrictEqual(Object.keys(sorted), ['a', 'z']);
		assert.deepStrictEqual(Object.keys(sorted.z), ['a', 'b']);
	});
});
