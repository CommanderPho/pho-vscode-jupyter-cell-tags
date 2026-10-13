import * as assert from 'assert';
import { buildDependencyChain, CellSymbolInfo } from './buildChain';

function sym(partial: Partial<CellSymbolInfo>): CellSymbolInfo {
	return {
		defines: [],
		uses: [],
		mutations: [],
		parseError: false,
		starImport: false,
		dynamicExec: false,
		...partial,
	};
}

suite('Dependency chain builder', () => {
	test('numbers hops along a straight chain', () => {
		const chain = buildDependencyChain(
			[
				sym({ defines: ['a'] }),
				sym({ defines: ['b'], uses: ['a'] }),
				sym({ uses: ['b'] }),
			],
			2
		);

		assert.deepStrictEqual(chain.hops, [
			{ cellIndex: 1, hop: 1 },
			{ cellIndex: 0, hop: 2 },
		]);
		assert.strictEqual(chain.tree.hop, 0);
		assert.strictEqual(chain.tree.children.length, 1);
		assert.strictEqual(chain.tree.children[0].cellIndex, 1);
		assert.deepStrictEqual(chain.tree.children[0].names, ['b']);
		assert.strictEqual(chain.tree.children[0].children[0].cellIndex, 0);
		assert.deepStrictEqual(chain.tree.children[0].children[0].names, ['a']);
		assert.strictEqual(chain.tree.children[0].children[0].hop, 2);
	});

	test('keeps the smaller hop when a cell is reached two ways', () => {
		const chain = buildDependencyChain(
			[
				sym({ defines: ['a'] }),
				sym({ defines: ['b'], uses: ['a'] }),
				sym({ uses: ['a', 'b'] }),
			],
			2
		);

		assert.deepStrictEqual(chain.hops, [
			{ cellIndex: 0, hop: 1 },
			{ cellIndex: 1, hop: 1 },
		]);
		const cell0 = chain.tree.children.find((child) => child.cellIndex === 0);
		assert.ok(cell0);
		assert.strictEqual(cell0!.children.length, 0);
		assert.deepStrictEqual(cell0!.names, ['a']);
	});

	test('uses the latest earlier definition', () => {
		const chain = buildDependencyChain(
			[
				sym({ defines: ['a'] }),
				sym({ defines: ['a'] }),
				sym({ uses: ['a'] }),
			],
			2
		);

		assert.deepStrictEqual(chain.hops, [{ cellIndex: 1, hop: 1 }]);
		assert.deepStrictEqual(chain.unresolved, []);
	});

	test('treats a mutation as the definition later cells depend on', () => {
		const chain = buildDependencyChain(
			[
				sym({ defines: ['df'] }),
				sym({ uses: ['df'], mutations: ['df'] }),
				sym({ uses: ['df'] }),
			],
			2
		);

		assert.deepStrictEqual(chain.hops, [
			{ cellIndex: 1, hop: 1 },
			{ cellIndex: 0, hop: 2 },
		]);
		assert.deepStrictEqual(chain.tree.children[0].names, ['df']);
		assert.deepStrictEqual(chain.tree.children[0].children[0].names, ['df']);
	});

	test('records unresolved names on the target', () => {
		const chain = buildDependencyChain(
			[sym({ defines: ['a'] }), sym({ uses: ['a', 'missing'] })],
			1
		);

		assert.deepStrictEqual(chain.unresolved, ['missing']);
		assert.deepStrictEqual(chain.tree.unresolved, ['missing']);
		assert.deepStrictEqual(chain.hops, [{ cellIndex: 0, hop: 1 }]);
	});

	test('does not look at cells after the target', () => {
		const chain = buildDependencyChain(
			[sym({ uses: ['a'] }), sym({ defines: ['a'] })],
			0
		);

		assert.deepStrictEqual(chain.hops, []);
		assert.deepStrictEqual(chain.unresolved, ['a']);
	});

	test('groups several names on one edge', () => {
		const chain = buildDependencyChain(
			[sym({ defines: ['b', 'a'] }), sym({ uses: ['b', 'a'] })],
			1
		);

		assert.deepStrictEqual(chain.tree.children[0].names, ['a', 'b']);
	});

	test('notes star imports and cells that failed to parse', () => {
		const chain = buildDependencyChain(
			[
				sym({ starImport: true }),
				sym({ parseError: true }),
				sym({ uses: ['x'] }),
			],
			2
		);

		assert.deepStrictEqual(chain.starImportCells, [0]);
		assert.deepStrictEqual(chain.parseErrorCells, [1]);
		assert.deepStrictEqual(chain.unresolved, ['x']);
		assert.deepStrictEqual(chain.hops, []);
	});
});
