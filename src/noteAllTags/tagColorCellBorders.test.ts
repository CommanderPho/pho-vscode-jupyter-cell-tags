import * as assert from 'assert';
import { boxLineRoles, planTagColorBorders } from './tagColorCellBorders';

suite('tag color cell border planner', () => {
	test('skips tags without a provided color', () => {
		const plan = planTagColorBorders(['plain', 'red', 'also-plain'], {
			plain: undefined,
			red: '#e74c3c',
		});
		assert.deepStrictEqual(plan.primary, { name: 'red', color: '#e74c3c' });
		assert.deepStrictEqual(plan.extras, []);
	});

	test('uses cell tag order for the primary box', () => {
		const plan = planTagColorBorders(['green', 'red'], {
			red: '#e74c3c',
			green: '#2ecc71',
		});
		assert.deepStrictEqual(plan.primary, { name: 'green', color: '#2ecc71' });
		assert.deepStrictEqual(plan.extras, [{ name: 'red', color: '#e74c3c' }]);
	});

	test('treats later colored tags as extra stripes', () => {
		const plan = planTagColorBorders(['a', 'plain', 'b', 'c'], {
			a: '#111111',
			b: '#222222',
			c: '#333333',
		});
		assert.deepStrictEqual(plan.primary, { name: 'a', color: '#111111' });
		assert.deepStrictEqual(plan.extras, [
			{ name: 'b', color: '#222222' },
			{ name: 'c', color: '#333333' },
		]);
	});

	test('returns no borders when no tag has a color', () => {
		const plan = planTagColorBorders(['a', 'b'], {});
		assert.strictEqual(plan.primary, undefined);
		assert.deepStrictEqual(plan.extras, []);
	});

	test('boxLineRoles: none for empty documents', () => {
		assert.deepStrictEqual(boxLineRoles(0), { kind: 'none' });
	});

	test('boxLineRoles: single line is a full box', () => {
		assert.deepStrictEqual(boxLineRoles(1), { kind: 'single', line: 0 });
	});

	test('boxLineRoles: two lines are first and last only', () => {
		assert.deepStrictEqual(boxLineRoles(2), { kind: 'split', first: 0, last: 1 });
	});

	test('boxLineRoles: three-plus lines include a middle span', () => {
		assert.deepStrictEqual(boxLineRoles(3), {
			kind: 'split',
			first: 0,
			middle: { start: 1, endExclusive: 2 },
			last: 2,
		});
		assert.deepStrictEqual(boxLineRoles(5), {
			kind: 'split',
			first: 0,
			middle: { start: 1, endExclusive: 4 },
			last: 4,
		});
	});
});
