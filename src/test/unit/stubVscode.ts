import * as Module from 'module';

/**
 * `@types/vscode` is types-only; unit tests outside the Extension Host need a
 * tiny stub so modules that `require('vscode')` can load under plain Mocha.
 */
export function installVscodeStub(): () => void {
	const nodeRequire = Module.prototype.require;
	const stub = {
		workspace: {
			onDidChangeConfiguration: () => ({ dispose() { /* noop */ } }),
			getConfiguration: () => ({
				get: () => undefined,
				inspect: () => undefined,
				update: async () => undefined,
			}),
		},
		commands: {
			registerCommand: () => ({ dispose() { /* noop */ } }),
			executeCommand: async () => undefined,
		},
		window: {
			createWebviewPanel: () => {
				throw new Error('vscode.window.createWebviewPanel stub');
			},
		},
		ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
	};

	Module.prototype.require = function (this: NodeModule, id: string) {
		if (id === 'vscode') {
			return stub;
		}
		return nodeRequire.apply(this, arguments as unknown as [string]);
	};

	return () => {
		Module.prototype.require = nodeRequire;
	};
}
