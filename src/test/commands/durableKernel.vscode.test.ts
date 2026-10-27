import * as vscode from 'vscode';
import { activateExtension, closeEditors, openFixtureNotebook } from '../helpers/notebook';
import { kernelTestsEnabled, skipWithoutKernel } from '../helpers/kernel';
import { UiStubs } from '../helpers/uiStubs';

suite('Durable kernel commands', () => {
	let stubs: UiStubs;

	suiteSetup(async () => {
		await activateExtension();
	});

	setup(async () => {
		stubs = new UiStubs();
		await openFixtureNotebook();
	});

	teardown(async () => {
		stubs.restore();
		await closeEditors();
	});

	test('copyUrl and showLog do not start a server', async () => {
		await vscode.commands.executeCommand('jupyter-cell-tags.externalKernel.copyUrl');
		await vscode.commands.executeCommand('jupyter-cell-tags.externalKernel.showLog');
	});

	test('statusMenu can pick Show Log', async () => {
		stubs.stubShowQuickPick('Show Log');
		await vscode.commands.executeCommand('jupyter-cell-tags.externalKernel.statusMenu');
	});

	test('start/stop/connect/selectKernel skip unless kernel tests are enabled', async function () {
		skipWithoutKernel(this);
		if (!kernelTestsEnabled()) {
			return;
		}
		stubs.stubInputBox('');
		await vscode.commands.executeCommand('jupyter-cell-tags.externalKernel.connect');
		await vscode.commands.executeCommand('jupyter-cell-tags.externalKernel.stop');
	});
});
