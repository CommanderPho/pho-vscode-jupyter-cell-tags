import * as assert from 'assert';
import {
	emptyFilteredSnapshot,
	FilteredNotebookSnapshot,
	snapshotToNbformat,
	splitNbformatSource
} from './filteredCellSnapshot';

suite('filtered cell snapshot nbformat', () => {
	test('splitNbformatSource keeps newlines on every line except the last', () => {
		assert.deepStrictEqual(splitNbformatSource(''), []);
		assert.deepStrictEqual(splitNbformatSource('print(1)'), ['print(1)']);
		assert.deepStrictEqual(splitNbformatSource('a\nb\n'), ['a\n', 'b\n', '']);
	});

	test('code cells serialize with empty outputs and null execution_count', () => {
		const snapshot: FilteredNotebookSnapshot = {
			metadata: { kernelspec: { name: 'python3' } },
			cells: [
				{
					cellType: 'code',
					source: 'print("tagged-a")\n',
					languageId: 'python',
					metadata: { tags: ['existing-tag'] }
				},
				{
					cellType: 'markdown',
					source: '# Heading\n',
					languageId: 'markdown',
					metadata: {}
				}
			]
		};
		const nb = snapshotToNbformat(snapshot);
		assert.strictEqual(nb.nbformat, 4);
		assert.strictEqual(nb.cells.length, 2);

		const code = nb.cells[0];
		assert.strictEqual(code.cell_type, 'code');
		assert.deepStrictEqual(code.outputs, []);
		assert.strictEqual(code.execution_count, null);
		assert.deepStrictEqual((code.metadata as { tags: string[] }).tags, ['existing-tag']);

		const markdown = nb.cells[1];
		assert.strictEqual(markdown.cell_type, 'markdown');
		assert.strictEqual('outputs' in markdown, false);
	});

	test('empty snapshot has no cells and still no outputs', () => {
		const nb = snapshotToNbformat(emptyFilteredSnapshot());
		assert.deepStrictEqual(nb.cells, []);
		assert.ok(JSON.stringify(nb).indexOf('"outputs"') === -1);
	});
});
