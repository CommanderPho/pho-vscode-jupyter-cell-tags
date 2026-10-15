import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DurableServerManager } from './DurableServerManager';
import { DurableJupyterServerCollection } from './jupyterServerCollection';
import { DurableKernelStatusMonitor } from './statusMonitor';
import { isFeatureEnabled } from '../util/featureFlags';
import { log } from '../util/logging';

export function activateExternalKernel(context: vscode.ExtensionContext): DurableServerManager | undefined {
	if (!isFeatureEnabled('durableKernel')) {
		log('[DurableJupyter] Feature disabled via jupyter-cell-tags.features.durableKernel');
		return undefined;
	}

	const manager = new DurableServerManager(context);
	const collection = new DurableJupyterServerCollection(manager);
	const monitor = new DurableKernelStatusMonitor(manager);

	context.subscriptions.push(manager, collection, monitor, manager.outputChannel);

	// Ensure Select toolbar item is visible until we detect an attached kernel.
	void vscode.commands.executeCommand(
		'setContext',
		'jupyter-cell-tags.externalKernel.notebookHasKernel',
		false
	);

	void manager.initialize().then(() => monitor.refresh());

	const autoRegister = () =>
		vscode.workspace
			.getConfiguration('jupyter-cell-tags')
			.get<boolean>('externalKernel.autoRegisterOnNotebookOpen', true) !== false;

	const ensureCollection = async () => {
		if (!autoRegister() && !collection.isRegistered) {
			// Still allow explicit commands to register
		}
		try {
			await collection.ensureRegistered();
		} catch (err) {
			log(`[DurableJupyter] Failed to register server collection: ${err}`);
			throw err;
		}
	};

	const registerWhenNotebookPresent = async () => {
		if (!autoRegister()) {
			return;
		}
		if (
			vscode.window.activeNotebookEditor ||
			vscode.workspace.notebookDocuments.length > 0
		) {
			try {
				await ensureCollection();
			} catch {
				// Jupyter may not be ready yet
			}
		}
	};

	context.subscriptions.push(
		vscode.window.onDidChangeActiveNotebookEditor(() => {
			void registerWhenNotebookPresent();
		}),
		vscode.workspace.onDidOpenNotebookDocument(() => {
			void registerWhenNotebookPresent();
		})
	);

	void registerWhenNotebookPresent();

	context.subscriptions.push(
		vscode.commands.registerCommand('jupyter-cell-tags.externalKernel.start', async () => {
			try {
				await ensureCollection();
				const record = await vscode.window.withProgress(
					{
						location: vscode.ProgressLocation.Notification,
						title: 'Starting durable Jupyter server…',
						cancellable: true,
					},
					async (_p, token) => manager.startManaged(token)
				);
				vscode.window.showInformationMessage(
					`Durable Jupyter ready at ${record.baseUrl} — Select Kernel → Durable Jupyter to connect.`
				);
				await monitor.refresh();
			} catch (err) {
				if (err instanceof vscode.CancellationError) {
					return;
				}
				const detail = err instanceof Error ? err.message : String(err);
				const choice = await vscode.window.showErrorMessage(
					`Failed to start durable Jupyter: ${detail}`,
					'Show Log'
				);
				if (choice === 'Show Log') {
					await vscode.commands.executeCommand('jupyter-cell-tags.externalKernel.showLog');
				}
			}
		}),

		vscode.commands.registerCommand('jupyter-cell-tags.externalKernel.stop', async () => {
			await manager.stopManaged();
			await monitor.refresh();
		}),

		vscode.commands.registerCommand('jupyter-cell-tags.externalKernel.connect', async () => {
			try {
				await ensureCollection();
				const url = await vscode.window.showInputBox({
					title: 'Connect to Existing Jupyter Server',
					prompt: 'Server URL (e.g. http://127.0.0.1:8888/?token=…)',
					ignoreFocusOut: true,
				});
				if (!url) {
					return;
				}
				let tokenValue: string | undefined;
				try {
					const u = new URL(url.includes('://') ? url : `http://${url}`);
					if (!u.searchParams.get('token')) {
						tokenValue = await vscode.window.showInputBox({
							title: 'Jupyter Token (optional)',
							password: true,
							ignoreFocusOut: true,
						});
						if (tokenValue === undefined) {
							return;
						}
					}
				} catch {
					// manager will validate
				}
				const record = await manager.connectExisting(url, tokenValue);
				vscode.window.showInformationMessage(
					`Connected durable server ${record.baseUrl} — Select Kernel → Durable Jupyter to use it.`
				);
				await monitor.refresh();
			} catch (err) {
				vscode.window.showErrorMessage(`Failed to connect: ${err}`);
			}
		}),

		vscode.commands.registerCommand('jupyter-cell-tags.externalKernel.copyUrl', async () => {
			const primary = manager.managedServer ?? manager.getServers()[0];
			if (!primary) {
				vscode.window.showWarningMessage('No durable Jupyter server is registered.');
				return;
			}
			const withToken = primary.token
				? `${primary.baseUrl}/?token=${primary.token}`
				: primary.baseUrl;
			await vscode.env.clipboard.writeText(withToken);
			vscode.window.setStatusBarMessage('Durable Jupyter URL copied', 2000);
		}),

		vscode.commands.registerCommand('jupyter-cell-tags.externalKernel.showLog', async () => {
			manager.outputChannel.show(true);
			const logPath =
				manager.managedServer?.logPath ||
				// Fall back to newest durable-jupyter-*.log in globalStorage after a failed start
				findNewestDurableLog(context.globalStorageUri.fsPath);
			if (logPath && fs.existsSync(logPath)) {
				try {
					const text = await fs.promises.readFile(logPath, 'utf8');
					const tail = text.slice(-8000);
					manager.outputChannel.appendLine(`——— log file tail (${logPath}) ———`);
					manager.outputChannel.appendLine(tail);
				} catch (err) {
					manager.outputChannel.appendLine(`Could not read log file: ${err}`);
				}
			} else {
				manager.outputChannel.appendLine('No durable Jupyter log file found yet.');
			}
		}),

		vscode.commands.registerCommand('jupyter-cell-tags.externalKernel.selectKernel', async () => {
			// Capture before progress/dialogs steal focus — notebook.selectKernel requires a real editor.
			const editor = vscode.window.activeNotebookEditor;
			if (!editor) {
				vscode.window.showWarningMessage(
					'Open a Jupyter notebook first, then use Select Durable Kernel.'
				);
				return;
			}

			try {
				await ensureCollection();
			} catch (err) {
				vscode.window.showErrorMessage(`Durable kernel select failed: ${err}`);
				return;
			}

			if (!manager.managedServer && manager.getServers().length === 0) {
				try {
					await manager.startManaged();
				} catch (err) {
					if (!(err instanceof vscode.CancellationError)) {
						const detail = err instanceof Error ? err.message : String(err);
						const choice = await vscode.window.showWarningMessage(
							`Could not auto-start durable server: ${detail}. Opening Kernel Picker — use “Durable Jupyter” → Connect, or fix jupyterEnhancements.kernel.pythonPath.`,
							'Show Log'
						);
						if (choice === 'Show Log') {
							await vscode.commands.executeCommand('jupyter-cell-tags.externalKernel.showLog');
						}
					}
				}
			}

			// Must pass notebookEditor; bare notebook.selectKernel can throw
			// "Cannot use 'in' operator to search for 'notebookEditorId' in null".
			await vscode.commands.executeCommand('notebook.selectKernel', {
				notebookEditor: editor,
			});
		}),

		vscode.commands.registerCommand('jupyter-cell-tags.externalKernel.statusMenu', async () => {
			const items: (vscode.QuickPickItem & { action: string })[] = [
				{ label: '$(play) Start Durable Server', action: 'start' },
				{ label: '$(plug) Connect to Existing URL…', action: 'connect' },
				{
					label: '$(debug-stop) Stop Managed Server',
					action: 'stop',
					description: manager.managedServer ? undefined : 'No managed server',
				},
				{ label: '$(copy) Copy Server URL', action: 'copy' },
				{ label: '$(output) Show Log', action: 'log' },
				{ label: '$(vm) Select Kernel…', action: 'select' },
			];
			const pick = await vscode.window.showQuickPick(items, {
				title: 'Durable Jupyter',
				placeHolder: 'Choose an action',
			});
			if (!pick) {
				return;
			}
			switch (pick.action) {
				case 'start':
					await vscode.commands.executeCommand('jupyter-cell-tags.externalKernel.start');
					break;
				case 'connect':
					await vscode.commands.executeCommand('jupyter-cell-tags.externalKernel.connect');
					break;
				case 'stop':
					await vscode.commands.executeCommand('jupyter-cell-tags.externalKernel.stop');
					break;
				case 'copy':
					await vscode.commands.executeCommand('jupyter-cell-tags.externalKernel.copyUrl');
					break;
				case 'log':
					await vscode.commands.executeCommand('jupyter-cell-tags.externalKernel.showLog');
					break;
				case 'select':
					await vscode.commands.executeCommand('jupyter-cell-tags.externalKernel.selectKernel');
					break;
			}
		})
	);

	log('[DurableJupyter] External kernel feature activated');
	return manager;
}

function findNewestDurableLog(storageDir: string): string | undefined {
	try {
		if (!fs.existsSync(storageDir)) {
			return undefined;
		}
		const files = fs
			.readdirSync(storageDir)
			.filter((f) => f.startsWith('durable-jupyter-') && f.endsWith('.log'))
			.map((f) => {
				const full = path.join(storageDir, f);
				return { full, mtime: fs.statSync(full).mtimeMs };
			})
			.sort((a, b) => b.mtime - a.mtime);
		return files[0]?.full;
	} catch {
		return undefined;
	}
}
