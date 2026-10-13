import * as vscode from 'vscode';
import { Jupyter, JupyterServer } from '@vscode/jupyter-extension';
import { DurableServerManager, DurableServerRecord } from './DurableServerManager';

const COLLECTION_ID = 'jupyter-cell-tags.durable';
const COLLECTION_LABEL = 'Durable Jupyter (survives reload)';

const CMD_START = 'Start Durable Server';
const CMD_CONNECT = 'Connect to Existing Server URL…';

export class DurableJupyterServerCollection implements vscode.Disposable {
	private collection: { dispose(): void; commandProvider?: unknown; label: string; documentation?: vscode.Uri } | undefined;
	private registered = false;

	constructor(private readonly manager: DurableServerManager) {}

	get isRegistered(): boolean {
		return this.registered;
	}

	async ensureRegistered(): Promise<void> {
		if (this.registered) {
			return;
		}

		const ext = vscode.extensions.getExtension<Jupyter>('ms-toolsai.jupyter');
		if (!ext) {
			throw new Error('Jupyter extension (ms-toolsai.jupyter) is not installed');
		}
		if (!ext.isActive) {
			await ext.activate();
		}

		const jupyter = ext.exports;
		if (typeof jupyter.createJupyterServerCollection !== 'function') {
			throw new Error('Jupyter extension does not expose createJupyterServerCollection');
		}

		const changeEmitter = new vscode.EventEmitter<void>();
		this.manager.onDidChangeServers(() => changeEmitter.fire());

		const collection = jupyter.createJupyterServerCollection(COLLECTION_ID, COLLECTION_LABEL, {
			onDidChangeServers: changeEmitter.event,
			provideJupyterServers: async () => this.toJupyterServers(),
			resolveJupyterServer: async (server: JupyterServer) => server,
		});

		collection.documentation = vscode.Uri.parse(
			'https://github.com/microsoft/vscode-jupyter/wiki/Connecting-to-a-remote-Jupyter-server-from-vscode.dev'
		);

		collection.commandProvider = {
			provideCommands: async () => {
				const hasManaged = !!this.manager.managedServer;
				const commands: { label: string; description?: string; canBeAutoSelected?: boolean }[] = [];
				if (!hasManaged) {
					commands.push({
						label: CMD_START,
						description: 'Spawn a detached local Jupyter server that survives Extension Host restart',
						canBeAutoSelected: true,
					});
				}
				commands.push({
					label: CMD_CONNECT,
					description: 'Register an already-running Jupyter server URL',
				});
				return commands;
			},
			handleCommand: async (command, token) => {
				try {
					if (command.label === CMD_START) {
						const record = await vscode.window.withProgress(
							{
								location: vscode.ProgressLocation.Notification,
								title: 'Starting durable Jupyter server…',
								cancellable: true,
							},
							async (_progress, progressToken) => {
								const linked = linkCancellation(token, progressToken);
								return this.manager.startManaged(linked);
							}
						);
						return this.toJupyterServer(record);
					}

					if (command.label === CMD_CONNECT) {
						const record = await promptAndConnect(this.manager, token);
						return record ? this.toJupyterServer(record) : undefined;
					}
				} catch (err) {
					if (err instanceof vscode.CancellationError) {
						throw err;
					}
					vscode.window.showErrorMessage(`Durable Jupyter: ${err}`);
					throw new vscode.CancellationError();
				}

				return undefined;
			},
		};

		this.collection = collection;
		this.registered = true;
	}

	private toJupyterServers(): JupyterServer[] {
		return this.manager.getServers().map((s) => this.toJupyterServer(s));
	}

	private toJupyterServer(record: DurableServerRecord): JupyterServer {
		return {
			id: record.id,
			label: record.label,
			connectionInformation: {
				baseUrl: vscode.Uri.parse(record.baseUrl),
				token: record.token || undefined,
			},
		};
	}

	dispose(): void {
		this.collection?.dispose();
		this.collection = undefined;
		this.registered = false;
	}
}

async function promptAndConnect(
	manager: DurableServerManager,
	token: vscode.CancellationToken
): Promise<DurableServerRecord | undefined> {
	const disposables: vscode.Disposable[] = [];
	try {
		const url = await new Promise<string | undefined>((resolve, reject) => {
			let settled = false;
			const finish = (value: string | undefined) => {
				if (settled) {
					return;
				}
				settled = true;
				resolve(value);
			};
			const cancel = () => {
				if (settled) {
					return;
				}
				settled = true;
				reject(new vscode.CancellationError());
			};

			const input = vscode.window.createInputBox();
			disposables.push(input);
			input.title = 'Connect to Existing Jupyter Server';
			input.prompt = 'Server URL (e.g. http://127.0.0.1:8888/?token=…)';
			input.ignoreFocusOut = true;
			input.buttons = [vscode.QuickInputButtons.Back];
			input.onDidTriggerButton((btn) => {
				if (btn === vscode.QuickInputButtons.Back) {
					finish(undefined); // back → return undefined to Jupyter picker
					input.hide();
				}
			}, disposables);
			input.onDidHide(() => {
				if (!settled) {
					cancel(); // Esc / close → exit kernel picker
				}
			}, disposables);
			input.onDidAccept(() => {
				const value = input.value.trim();
				if (!value) {
					return;
				}
				finish(value);
				input.hide();
			}, disposables);
			token.onCancellationRequested(() => {
				cancel();
				input.hide();
			}, undefined, disposables);
			input.show();
		});

		if (url === undefined) {
			return undefined; // back
		}

		let tokenValue: string | undefined;
		try {
			const u = new URL(url.includes('://') ? url : `http://${url}`);
			if (!u.searchParams.get('token')) {
				tokenValue = await vscode.window.showInputBox({
					title: 'Jupyter Token (optional)',
					prompt: 'Leave empty if the server has no token',
					password: true,
					ignoreFocusOut: true,
				});
				if (tokenValue === undefined) {
					throw new vscode.CancellationError();
				}
			}
		} catch (err) {
			if (err instanceof vscode.CancellationError) {
				throw err;
			}
		}

		return await manager.connectExisting(url, tokenValue);
	} finally {
		vscode.Disposable.from(...disposables).dispose();
	}
}

function linkCancellation(
	a: vscode.CancellationToken,
	b: vscode.CancellationToken
): vscode.CancellationToken {
	const source = new vscode.CancellationTokenSource();
	const forward = () => source.cancel();
	a.onCancellationRequested(forward);
	b.onCancellationRequested(forward);
	if (a.isCancellationRequested || b.isCancellationRequested) {
		source.cancel();
	}
	return source.token;
}
