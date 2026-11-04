import * as assert from 'assert';
import { stripLoneSurrogates } from './unicodeInterop';

suite('stripLoneSurrogates', () => {
	test('replaces a lone low surrogate', () => {
		assert.strictEqual(stripLoneSurrogates('a\uDC9Db'), 'a\uFFFDb');
	});

	test('replaces a lone high surrogate', () => {
		assert.strictEqual(stripLoneSurrogates('a\uD800b'), 'a\uFFFDb');
	});

	test('preserves a valid surrogate pair (emoji)', () => {
		const emoji = 'x\uD83D\uDE00y'; // 😀
		assert.strictEqual(stripLoneSurrogates(emoji), emoji);
	});

	test('leaves ASCII and non-surrogate Unicode unchanged', () => {
		const text = 'café π x = 1';
		assert.strictEqual(stripLoneSurrogates(text), text);
	});
});
