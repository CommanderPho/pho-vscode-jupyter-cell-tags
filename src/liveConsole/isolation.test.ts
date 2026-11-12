import * as assert from 'assert';
import * as Module from 'module';
import { installVscodeStub } from '../test/unit/stubVscode';

/**
 * Regression: loading Live Console startup must not pull in `typescript`.
 * The packaged extension used to fail activation entirely when `typescript`
 * was missing from the VSIX, even with Live Console disabled.
 */
suite('liveConsole module isolation', () => {
	test('startup.js loads without requiring typescript', () => {
		const restoreVscode = installVscodeStub();
		const startupPath = require.resolve('./startup');
		const panelPath = require.resolve('./liveConsolePanel');
		const evaluatorPath = require.resolve('./evaluator');
		const loggingPath = require.resolve('../util/logging');

		for (const id of [startupPath, panelPath, evaluatorPath, loggingPath]) {
			delete require.cache[id];
		}

		const nodeRequire = Module.prototype.require;
		const forbidden: string[] = [];
		Module.prototype.require = function (this: NodeModule, id: string) {
			if (id === 'typescript' || id === 'typescript/lib/typescript') {
				forbidden.push(id);
				throw new Error(`unexpected require of ${id}`);
			}
			return nodeRequire.apply(this, arguments as unknown as [string]);
		};

		try {
			const startup = nodeRequire.call(module, './startup') as typeof import('./startup');
			assert.strictEqual(
				startup.LIVE_CONSOLE_OPEN_COMMAND,
				'jupyter-cell-tags.liveConsole.open'
			);
			assert.deepStrictEqual(forbidden, []);
			assert.strictEqual(require.cache[panelPath], undefined, 'panel should stay unloaded');
			assert.strictEqual(require.cache[evaluatorPath], undefined, 'evaluator should stay unloaded');
		} finally {
			Module.prototype.require = nodeRequire;
			restoreVscode();
			for (const id of [startupPath, panelPath, evaluatorPath, loggingPath]) {
				delete require.cache[id];
			}
		}
	});

	test('evaluator.js loads without requiring typescript until transpile', () => {
		const evaluatorPath = require.resolve('./evaluator');
		delete require.cache[evaluatorPath];

		const nodeRequire = Module.prototype.require;
		let typescriptRequired = false;
		Module.prototype.require = function (this: NodeModule, id: string) {
			if (id === 'typescript') {
				typescriptRequired = true;
			}
			return nodeRequire.apply(this, arguments as unknown as [string]);
		};

		try {
			const evaluator = nodeRequire.call(module, './evaluator') as typeof import('./evaluator');
			assert.strictEqual(typescriptRequired, false, 'load must not require typescript');
			assert.strictEqual(evaluator.coerceReturn('1'), 'return (1);');
			assert.strictEqual(typescriptRequired, false, 'coerceReturn must not require typescript');

			evaluator.transpileTypeScript('return 1;');
			assert.strictEqual(typescriptRequired, true, 'transpile must require typescript');
		} finally {
			Module.prototype.require = nodeRequire;
			delete require.cache[evaluatorPath];
			try {
				delete require.cache[require.resolve('typescript')];
			} catch {
				// ignore
			}
		}
	});
});
