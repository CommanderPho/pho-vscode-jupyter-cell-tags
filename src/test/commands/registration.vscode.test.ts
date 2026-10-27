import * as assert from 'assert';
import * as vscode from 'vscode';
import { activateExtension } from '../helpers/notebook';

suite('Command registration', () => {
	let extension: vscode.Extension<unknown>;

	suiteSetup(async () => {
		extension = await activateExtension();
	});

	test('every contributed command is registered', async () => {
		const contributed = (extension.packageJSON.contributes.commands as { command: string }[])
			.map((entry) => entry.command);
		assert.ok(contributed.length > 0, 'package.json should contribute commands');

		const registered = new Set(await vscode.commands.getCommands(true));
		const missing = contributed.filter((id) => !registered.has(id));
		assert.deepStrictEqual(missing, [], `Unregistered commands: ${missing.join(', ')}`);
	});

	test('jupyter-cell-tags.listKernels is registered under the contributed id', async () => {
		const registered = await vscode.commands.getCommands(true);
		assert.ok(registered.includes('jupyter-cell-tags.listKernels'));
	});
});
