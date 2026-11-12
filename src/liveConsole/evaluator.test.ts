import * as assert from 'assert';
import type { LiveConsoleApi } from './consoleApi';
import { coerceReturn, evaluateTypeScript, transpileTypeScript } from './evaluator';

function stubApi(): LiveConsoleApi {
	return {
		getActiveNotebook: () => undefined,
		getActiveCell: () => undefined,
		getActiveCells: () => undefined,
		findNotebookEditor: () => undefined,
		getKernel: async () => undefined,
		executeOnKernel: async () => [],
		describeStatus: async () => ({ kernelAvailable: false }),
	};
}

function bindings(api: LiveConsoleApi = stubApi()) {
	return {
		vscode: {} as typeof import('vscode'),
		api,
	};
}

suite('liveConsole evaluator', () => {
	test('coerceReturn wraps single expressions', () => {
		assert.strictEqual(coerceReturn('1 + 2'), 'return (1 + 2);');
		assert.strictEqual(coerceReturn('api.getActiveCell()'), 'return (api.getActiveCell());');
	});

	test('coerceReturn leaves statements and explicit returns alone', () => {
		assert.strictEqual(coerceReturn('const x = 1;\nreturn x;'), 'const x = 1;\nreturn x;');
		assert.strictEqual(coerceReturn('return 42;'), 'return 42;');
		assert.ok(coerceReturn('const x = 1').startsWith('const'));
	});

	test('transpileTypeScript strips types', () => {
		const js = transpileTypeScript('const n: number = 3;\nreturn n * 2;');
		assert.ok(!js.includes(': number'));
		assert.ok(js.includes('return'));
	});

	test('evaluateTypeScript returns expression values', async () => {
		const result = await evaluateTypeScript('1 + 2', bindings());
		assert.strictEqual(result.ok, true);
		assert.strictEqual(result.valueText, '3');
	});

	test('evaluateTypeScript captures console.log', async () => {
		const result = await evaluateTypeScript(
			'console.log("hello", 7);\nreturn "done";',
			bindings()
		);
		assert.strictEqual(result.ok, true);
		assert.strictEqual(result.valueText, 'done');
		assert.ok(result.logs.some((line) => line.level === 'log' && line.text.includes('hello')));
	});

	test('evaluateTypeScript exposes api bindings', async () => {
		const api = stubApi();
		api.describeStatus = async () => ({
			notebookName: 'demo.ipynb',
			kernelAvailable: true,
		});
		const result = await evaluateTypeScript(
			'return (await api.describeStatus()).notebookName;',
			bindings(api)
		);
		assert.strictEqual(result.ok, true);
		assert.strictEqual(result.valueText, 'demo.ipynb');
	});

	test('evaluateTypeScript reports runtime errors', async () => {
		const result = await evaluateTypeScript('throw new Error("boom");', bindings());
		assert.strictEqual(result.ok, false, result.errorText);
		assert.ok(result.errorText?.includes('boom'), result.errorText);
	});

	test('evaluateTypeScript reports transpile errors', async () => {
		const result = await evaluateTypeScript('const x: = 1;', bindings());
		assert.strictEqual(result.ok, false);
		assert.ok(result.errorText);
	});
});
