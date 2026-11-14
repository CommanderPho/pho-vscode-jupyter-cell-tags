import * as assert from 'assert';
import type * as vscode from 'vscode';
import { installVscodeStub } from '../test/unit/stubVscode';

suite('FeatureController isolation', () => {
	let restoreVscode: (() => void) | undefined;
	let FeatureController: typeof import('./featureLifecycle').FeatureController;

	suiteSetup(() => {
		restoreVscode = installVscodeStub();
		// Load after stubbing so `require('vscode')` inside featureLifecycle succeeds.
		({ FeatureController } = require('./featureLifecycle') as typeof import('./featureLifecycle'));
	});

	suiteTeardown(() => {
		restoreVscode?.();
		try {
			delete require.cache[require.resolve('./featureLifecycle')];
		} catch {
			// ignore
		}
	});

	function fakeParent(): vscode.ExtensionContext {
		return { subscriptions: [] } as unknown as vscode.ExtensionContext;
	}

	test('disabled feature activator is never called', async () => {
		let ringMeCalled = false;
		let gitDiffCalled = false;
		const controller = new FeatureController(
			fakeParent(),
			{
				ringMeJupyter: {
					activate: () => {
						ringMeCalled = true;
					},
				},
				gitDiff: {
					activate: () => {
						gitDiffCalled = true;
					},
				},
			},
			(feature) => feature === 'gitDiff'
		);

		await controller.start();

		assert.strictEqual(ringMeCalled, false);
		assert.strictEqual(gitDiffCalled, true);
		assert.strictEqual(controller.isLive('ringMeJupyter'), false);
		assert.strictEqual(controller.isLive('gitDiff'), true);
	});

	test('feature activate failure does not block other features', async () => {
		let gitDiffCalled = false;
		const controller = new FeatureController(
			fakeParent(),
			{
				ringMeJupyter: {
					activate: () => {
						throw new Error('simulated activate failure');
					},
				},
				gitDiff: {
					activate: () => {
						gitDiffCalled = true;
					},
				},
			},
			() => true
		);

		await controller.start();

		assert.strictEqual(controller.isLive('ringMeJupyter'), false);
		assert.strictEqual(gitDiffCalled, true);
		assert.strictEqual(controller.isLive('gitDiff'), true);
	});

	test('feature require-time failure does not block other features', async () => {
		let gitDiffCalled = false;
		const controller = new FeatureController(
			fakeParent(),
			{
				ringMeJupyter: {
					activate: () => {
						throw new Error("Cannot find module './ringMeJupyter/startup'");
					},
				},
				gitDiff: {
					activate: () => {
						gitDiffCalled = true;
					},
				},
			},
			() => true
		);

		await controller.start();

		assert.strictEqual(controller.isLive('ringMeJupyter'), false);
		assert.strictEqual(gitDiffCalled, true);
		assert.strictEqual(controller.isLive('gitDiff'), true);
	});
});
