import * as assert from 'assert';
import * as vscode from 'vscode';
import { LIVE_CONSOLE_OPEN_COMMAND } from '../../liveConsole/startup';
import { whenFeatureTogglesIdle } from '../../util/featureLifecycle';
import { activateExtension } from '../helpers/notebook';
import { waitFor } from '../helpers/waitFor';

const WORKSPACE = vscode.ConfigurationTarget.Workspace;

async function setLiveConsoleEnabled(enabled: boolean): Promise<void> {
	const config = vscode.workspace.getConfiguration('jupyter-cell-tags');
	await config.update('features.liveConsole', enabled, WORKSPACE);
	await whenFeatureTogglesIdle();
}

async function commandRegistered(id: string): Promise<boolean> {
	const commands = await vscode.commands.getCommands(true);
	return commands.includes(id);
}

suite('Live TypeScript console', () => {
	suiteSetup(async () => {
		await activateExtension();
		await setLiveConsoleEnabled(true);
	});

	suiteTeardown(async () => {
		await setLiveConsoleEnabled(true);
	});

	test('open command is registered when feature enabled', async () => {
		assert.ok(await commandRegistered(LIVE_CONSOLE_OPEN_COMMAND));
	});

	test('open command runs without throwing', async () => {
		await vscode.commands.executeCommand(LIVE_CONSOLE_OPEN_COMMAND);
		await waitFor(async () => {
			const titles = vscode.window.tabGroups.all
				.flatMap((group) => group.tabs)
				.map((tab) => tab.label);
			return titles.some((title) => /Live TypeScript Console/i.test(title));
		}, 5000);
	});

	test('disabling the feature unregisters the open command', async () => {
		await setLiveConsoleEnabled(false);
		await waitFor(async () => !(await commandRegistered(LIVE_CONSOLE_OPEN_COMMAND)), 5000);
		await setLiveConsoleEnabled(true);
		await waitFor(async () => commandRegistered(LIVE_CONSOLE_OPEN_COMMAND), 5000);
	});
});
