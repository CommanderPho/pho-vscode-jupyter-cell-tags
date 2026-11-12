import * as vscode from 'vscode';
import { createLiveConsoleApi, LiveConsoleStatus } from './consoleApi';
import { evaluateTypeScript, EvalResult } from './evaluator';

const PANEL_VIEW_TYPE = 'jupyter-cell-tags.liveConsole';

type WebviewReadyMessage = { type: 'ready' };
type WebviewRunMessage = { type: 'run'; code: string };
type WebviewClearMessage = { type: 'clear' };
type WebviewToExtensionMessage = WebviewReadyMessage | WebviewRunMessage | WebviewClearMessage;

type ExtensionStateMessage = {
	type: 'state';
	status: LiveConsoleStatus;
	running: boolean;
};

type ExtensionResultMessage = {
	type: 'result';
	result: EvalResult;
};

type ExtensionLogMessage = {
	type: 'cleared';
};

type ExtensionToWebviewMessage =
	| ExtensionStateMessage
	| ExtensionResultMessage
	| ExtensionLogMessage;

export class LiveConsolePanel implements vscode.Disposable {
	private panel: vscode.WebviewPanel | undefined;
	private readonly disposables: vscode.Disposable[] = [];
	private readonly api = createLiveConsoleApi();
	private running = false;

	open(): void {
		if (this.panel) {
			this.panel.reveal(vscode.ViewColumn.Beside, true);
			void this.postState();
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			PANEL_VIEW_TYPE,
			'Live TypeScript Console',
			{ viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
			{
				enableScripts: true,
				retainContextWhenHidden: true,
			}
		);
		this.panel = panel;
		panel.webview.html = this.getHtml(panel.webview);

		panel.webview.onDidReceiveMessage(
			async (message: WebviewToExtensionMessage) => {
				if (message.type === 'ready') {
					await this.postState();
					return;
				}
				if (message.type === 'clear') {
					this.post({ type: 'cleared' });
					return;
				}
				if (message.type === 'run') {
					await this.run(message.code);
				}
			},
			undefined,
			this.disposables
		);

		panel.onDidDispose(
			() => {
				this.panel = undefined;
			},
			undefined,
			this.disposables
		);

		this.disposables.push(
			vscode.window.onDidChangeActiveNotebookEditor(() => {
				void this.postState();
			}),
			vscode.window.onDidChangeNotebookEditorSelection(() => {
				void this.postState();
			})
		);
	}

	dispose(): void {
		const panel = this.panel;
		this.panel = undefined;
		panel?.dispose();
		while (this.disposables.length) {
			this.disposables.pop()?.dispose();
		}
	}

	private async run(code: string): Promise<void> {
		if (this.running) {
			return;
		}
		this.running = true;
		await this.postState();
		try {
			const result = await evaluateTypeScript(code, {
				vscode,
				api: this.api,
			});
			this.post({ type: 'result', result });
		} finally {
			this.running = false;
			await this.postState();
		}
	}

	private async postState(): Promise<void> {
		if (!this.panel) {
			return;
		}
		const status = await this.api.describeStatus();
		this.post({
			type: 'state',
			status,
			running: this.running,
		});
	}

	private post(message: ExtensionToWebviewMessage): void {
		void this.panel?.webview.postMessage(message);
	}

	private getHtml(webview: vscode.Webview): string {
		const nonce = getNonce();
		const csp = [
			`default-src 'none'`,
			`style-src ${webview.cspSource} 'unsafe-inline'`,
			`script-src 'nonce-${nonce}'`,
		].join('; ');

		const placeholder = escapeHtml(
			`// Bindings: vscode, api, console\n` +
				`// api.getKernel(), api.executeOnKernel(code), api.getActiveCell(), …\n` +
				`const cell = api.getActiveCell();\n` +
				`console.log('active cell', cell?.index);\n` +
				`return cell?.document.getText().slice(0, 80);`
		);

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta http-equiv="Content-Security-Policy" content="${csp}" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>Live TypeScript Console</title>
	<style>
		:root {
			color-scheme: light dark;
		}
		html, body {
			height: 100%;
			margin: 0;
		}
		body {
			display: flex;
			flex-direction: column;
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			background: var(--vscode-editor-background);
			box-sizing: border-box;
		}
		* { box-sizing: border-box; }
		.toolbar {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
			align-items: center;
			padding: 8px 12px;
			border-bottom: 1px solid var(--vscode-panel-border);
			background: var(--vscode-sideBar-background);
		}
		.status {
			flex: 1 1 auto;
			min-width: 160px;
			opacity: 0.9;
			font-size: 12px;
		}
		.status .warn { color: var(--vscode-editorWarning-foreground); }
		.status .ok { color: var(--vscode-testing-iconPassed, var(--vscode-textLink-foreground)); }
		.actions {
			display: flex;
			gap: 8px;
		}
		button {
			font-family: inherit;
			font-size: 12px;
			padding: 4px 10px;
			border: 1px solid var(--vscode-button-border, transparent);
			border-radius: 2px;
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			cursor: pointer;
		}
		button.secondary {
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
		}
		button:disabled {
			opacity: 0.5;
			cursor: default;
		}
		.editor-wrap {
			flex: 1 1 45%;
			min-height: 140px;
			display: flex;
			flex-direction: column;
			padding: 8px 12px 0;
		}
		textarea {
			flex: 1 1 auto;
			width: 100%;
			min-height: 120px;
			resize: vertical;
			font-family: var(--vscode-editor-font-family);
			font-size: var(--vscode-editor-font-size);
			line-height: 1.4;
			color: var(--vscode-editor-foreground);
			background: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
			padding: 8px;
		}
		textarea:focus {
			outline: 1px solid var(--vscode-focusBorder);
		}
		.hint {
			font-size: 11px;
			opacity: 0.7;
			padding: 4px 0 8px;
		}
		.output-wrap {
			flex: 1 1 40%;
			min-height: 120px;
			display: flex;
			flex-direction: column;
			border-top: 1px solid var(--vscode-panel-border);
			padding: 8px 12px 12px;
		}
		.output-label {
			font-weight: 600;
			margin-bottom: 6px;
			font-size: 12px;
		}
		#output {
			flex: 1 1 auto;
			overflow: auto;
			margin: 0;
			padding: 8px;
			font-family: var(--vscode-editor-font-family);
			font-size: var(--vscode-editor-font-size);
			line-height: 1.4;
			white-space: pre-wrap;
			word-break: break-word;
			background: var(--vscode-textBlockQuote-background);
			border: 1px solid var(--vscode-panel-border);
			border-radius: 2px;
		}
		.line-log { opacity: 0.95; }
		.line-info { opacity: 0.95; }
		.line-warn { color: var(--vscode-editorWarning-foreground); }
		.line-error { color: var(--vscode-errorForeground); }
		.line-debug { opacity: 0.7; }
		.line-result { color: var(--vscode-textLink-foreground); font-weight: 600; }
		.line-meta { opacity: 0.6; font-size: 11px; }
	</style>
</head>
<body>
	<div class="toolbar">
		<div class="status" id="status" data-testid="live-console-status">No notebook</div>
		<div class="actions">
			<button type="button" id="run" data-testid="live-console-run">Run</button>
			<button type="button" id="clear" class="secondary" data-testid="live-console-clear">Clear output</button>
		</div>
	</div>
	<div class="editor-wrap">
		<textarea id="code" spellcheck="false" data-testid="live-console-code" placeholder="${placeholder}"></textarea>
		<div class="hint">Ctrl/Cmd+Enter to run. Snippets run in the extension host with vscode + api bindings.</div>
	</div>
	<div class="output-wrap">
		<div class="output-label">Output</div>
		<pre id="output" data-testid="live-console-output"></pre>
	</div>
	<script nonce="${nonce}">
		const vscodeApi = acquireVsCodeApi();
		const codeEl = document.getElementById('code');
		const outputEl = document.getElementById('output');
		const statusEl = document.getElementById('status');
		const runBtn = document.getElementById('run');
		const clearBtn = document.getElementById('clear');
		let running = false;

		function appendLine(text, className) {
			const span = document.createElement('div');
			if (className) {
				span.className = className;
			}
			span.textContent = text;
			outputEl.appendChild(span);
			outputEl.scrollTop = outputEl.scrollHeight;
		}

		function setRunning(next) {
			running = next;
			runBtn.disabled = next;
			runBtn.textContent = next ? 'Running…' : 'Run';
		}

		function renderStatus(status, isRunning) {
			setRunning(!!isRunning);
			if (!status || !status.notebookName) {
				statusEl.innerHTML = '<span class="warn">No active notebook</span>';
				return;
			}
			const cell = status.cellIndex === undefined ? '—' : String(status.cellIndex);
			const kernel = status.kernelAvailable
				? '<span class="ok">kernel ready</span>'
				: '<span class="warn">no kernel</span>';
			statusEl.innerHTML = escapeHtml(status.notebookName) + ' · cell ' + escapeHtml(cell) + ' · ' + kernel;
		}

		function escapeHtml(text) {
			return String(text)
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;');
		}

		function run() {
			if (running) {
				return;
			}
			const code = codeEl.value;
			appendLine('› run', 'line-meta');
			vscodeApi.postMessage({ type: 'run', code });
		}

		runBtn.addEventListener('click', run);
		clearBtn.addEventListener('click', () => {
			vscodeApi.postMessage({ type: 'clear' });
		});
		codeEl.addEventListener('keydown', (e) => {
			if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
				e.preventDefault();
				run();
			}
		});

		window.addEventListener('message', (event) => {
			const message = event.data;
			if (!message || !message.type) {
				return;
			}
			if (message.type === 'state') {
				renderStatus(message.status, message.running);
				return;
			}
			if (message.type === 'cleared') {
				outputEl.textContent = '';
				return;
			}
			if (message.type === 'result') {
				const result = message.result;
				for (const line of result.logs || []) {
					appendLine(line.text, 'line-' + (line.level || 'log'));
				}
				if (result.ok) {
					appendLine('← ' + (result.valueText === undefined ? 'undefined' : result.valueText), 'line-result');
				} else {
					appendLine(result.errorText || 'Error', 'line-error');
				}
				appendLine('(' + result.durationMs + ' ms)', 'line-meta');
				appendLine('', '');
			}
		});

		vscodeApi.postMessage({ type: 'ready' });
	</script>
</body>
</html>`;
	}
}

function getNonce(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let nonce = '';
	for (let i = 0; i < 32; i++) {
		nonce += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return nonce;
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}
