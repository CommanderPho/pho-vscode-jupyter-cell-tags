import * as vscode from 'vscode';
import { getAllTagsFromActiveNotebook } from '../util/notebookSelection';
import { isFilterActive, NotebookFilterCriteria } from './filterCriteria';
import { FILTER_ACCENT_CSS } from './filterDecorators';
import { NotebookFilterManager } from './NotebookFilterManager';

export const NOTEBOOK_CELL_FILTER_VIEW_ID = 'notebook-cell-filter-view';

type WebviewStateMessage = {
	type: 'state';
	tags: string[];
	criteria: NotebookFilterCriteria;
	matchCount?: number;
	totalCount?: number;
	filterActive: boolean;
};

type WebviewApplyMessage = {
	type: 'apply';
	criteria: NotebookFilterCriteria;
};

type WebviewClearMessage = {
	type: 'clear';
};

type WebviewToExtensionMessage = WebviewApplyMessage | WebviewClearMessage;

export class NotebookFilterWebviewProvider implements vscode.WebviewViewProvider {
	private view?: vscode.WebviewView;

	constructor(private readonly manager: NotebookFilterManager) {}

	resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	): void {
		this.view = webviewView;
		webviewView.webview.options = {
			enableScripts: true
		};
		webviewView.webview.html = this.getHtml(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(async (message: WebviewToExtensionMessage) => {
			const editor = vscode.window.activeNotebookEditor;
			if (!editor) {
				vscode.window.showWarningMessage('Open a Jupyter notebook to filter cells.');
				return;
			}

			if (message.type === 'apply') {
				if (!isFilterActive(message.criteria)) {
					vscode.window.showInformationMessage('No filter criteria selected.');
					return;
				}
				const { matchCount, totalCount } = await this.manager.apply(editor.notebook, message.criteria);
				vscode.window.setStatusBarMessage(`Showing ${matchCount}/${totalCount} cells`, 3000);
				this.postState(editor.notebook);
				return;
			}

			if (message.type === 'clear') {
				await this.manager.clear(editor.notebook);
				vscode.window.setStatusBarMessage('Notebook cell filter cleared', 2000);
				this.postState(editor.notebook);
			}
		});

		webviewView.onDidDispose(() => {
			if (this.view === webviewView) {
				this.view = undefined;
			}
		});

		this.postState(vscode.window.activeNotebookEditor?.notebook);
	}

	/** Push current tags + filter state into the webview (no-op if not resolved). */
	postState(notebook?: vscode.NotebookDocument): void {
		if (!this.view) {
			return;
		}
		const snapshot = this.manager.getUiSnapshot(notebook);
		const tags = [...new Set((getAllTagsFromActiveNotebook() ?? []).flat())].sort((a, b) =>
			a.localeCompare(b)
		);
		const message: WebviewStateMessage = {
			type: 'state',
			tags,
			criteria: snapshot.criteria,
			matchCount: snapshot.matchCount,
			totalCount: snapshot.totalCount,
			filterActive: snapshot.filterActive
		};
		void this.view.webview.postMessage(message);
	}

	private getHtml(webview: vscode.Webview): string {
		const nonce = getNonce();
		const csp = [
			`default-src 'none'`,
			`style-src ${webview.cspSource} 'unsafe-inline'`,
			`script-src 'nonce-${nonce}'`
		].join('; ');

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="${csp}">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Notebook Cell Filter</title>
	<style>
		:root {
			--filter-accent: ${FILTER_ACCENT_CSS};
			--filter-accent-hover: #ffb733;
		}
		body {
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			background-color: var(--vscode-sideBar-background, var(--vscode-editor-background));
			padding: 12px;
			margin: 0;
			border-left: 3px solid transparent;
		}
		body.filter-active {
			border-left-color: var(--filter-accent);
		}
		h2 {
			font-size: 11px;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.04em;
			color: var(--vscode-descriptionForeground);
			margin: 14px 0 8px;
		}
		h2:first-child { margin-top: 0; }
		.section {
			margin-bottom: 4px;
		}
		.tags {
			display: flex;
			flex-direction: column;
			gap: 4px;
			max-height: 180px;
			overflow-y: auto;
			padding: 4px 0;
		}
		.tag-row, .radio-row {
			display: flex;
			align-items: center;
			gap: 6px;
			cursor: pointer;
			user-select: none;
		}
		.tag-row:hover, .radio-row:hover {
			color: var(--vscode-list-hoverForeground);
		}
		.muted {
			color: var(--vscode-descriptionForeground);
			font-style: italic;
			padding: 4px 0;
		}
		.radios {
			display: flex;
			flex-direction: row;
			flex-wrap: wrap;
			align-items: center;
			gap: 10px 14px;
		}
		.actions {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
			margin-top: 16px;
		}
		button {
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			padding: 4px 12px;
			border: 1px solid var(--vscode-button-border, transparent);
			border-radius: 2px;
			cursor: pointer;
		}
		button.primary {
			background: var(--filter-accent);
			color: #1a1a1a;
			border-color: var(--filter-accent);
		}
		button.primary:hover {
			background: var(--filter-accent-hover);
			border-color: var(--filter-accent-hover);
		}
		button.secondary {
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
		}
		button.secondary:hover {
			background: var(--vscode-button-secondaryHoverBackground);
		}
		button:disabled {
			opacity: 0.5;
			cursor: default;
		}
		.status {
			margin-top: 12px;
			color: var(--vscode-descriptionForeground);
			font-size: 12px;
			min-height: 1.2em;
		}
		.status.active {
			color: var(--filter-accent);
			font-weight: 600;
		}
		input[type="checkbox"], input[type="radio"] {
			accent-color: var(--filter-accent);
		}
	</style>
</head>
<body>
	<div class="section">
		<h2>Tags <span class="muted">(any match)</span></h2>
		<div id="tags" class="tags"></div>
	</div>
	<div class="section">
		<h2>Cell Kind</h2>
		<div class="radios" id="kind">
			<label class="radio-row"><input type="radio" name="kind" value="any" checked> Any</label>
			<label class="radio-row"><input type="radio" name="kind" value="code"> Code</label>
			<label class="radio-row"><input type="radio" name="kind" value="markup"> Markdown</label>
		</div>
	</div>
	<div class="section">
		<h2>Has Outputs</h2>
		<div class="radios" id="outputs">
			<label class="radio-row"><input type="radio" name="outputs" value="any" checked> Any</label>
			<label class="radio-row"><input type="radio" name="outputs" value="yes"> Yes</label>
			<label class="radio-row"><input type="radio" name="outputs" value="no"> No</label>
		</div>
	</div>
	<div class="section">
		<h2>Executed</h2>
		<div class="radios" id="executed">
			<label class="radio-row"><input type="radio" name="executed" value="any" checked> Any</label>
			<label class="radio-row"><input type="radio" name="executed" value="yes"> Yes</label>
			<label class="radio-row"><input type="radio" name="executed" value="no"> No</label>
		</div>
	</div>
	<div class="actions">
		<button class="primary" id="applyBtn" data-testid="notebook-filter-apply">Filter</button>
		<button class="secondary" id="clearBtn" data-testid="notebook-filter-clear" disabled>Clear Filter</button>
	</div>
	<div class="status" id="status"></div>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const tagsEl = document.getElementById('tags');
		const statusEl = document.getElementById('status');
		const clearBtn = document.getElementById('clearBtn');
		const applyBtn = document.getElementById('applyBtn');

		function setRadio(name, value) {
			const el = document.querySelector('input[name="' + name + '"][value="' + value + '"]');
			if (el) { el.checked = true; }
		}

		function getRadio(name) {
			const el = document.querySelector('input[name="' + name + '"]:checked');
			return el ? el.value : 'any';
		}

		function renderTags(tags, selected) {
			const selectedSet = new Set((selected || []).map(t => t.toLowerCase()));
			tagsEl.innerHTML = '';
			if (!tags || tags.length === 0) {
				const empty = document.createElement('div');
				empty.className = 'muted';
				empty.textContent = 'No tags in this notebook';
				tagsEl.appendChild(empty);
				return;
			}
			for (const tag of tags) {
				const label = document.createElement('label');
				label.className = 'tag-row';
				const input = document.createElement('input');
				input.type = 'checkbox';
				input.value = tag;
				input.checked = selectedSet.has(tag.toLowerCase());
				label.appendChild(input);
				label.appendChild(document.createTextNode(tag));
				tagsEl.appendChild(label);
			}
		}

		function collectCriteria() {
			const criteria = {};
			const selectedTags = Array.from(tagsEl.querySelectorAll('input[type="checkbox"]:checked'))
				.map(el => el.value);
			if (selectedTags.length > 0) {
				criteria.tags = selectedTags;
			}
			const kind = getRadio('kind');
			if (kind === 'code' || kind === 'markup') {
				criteria.cellKind = kind;
			}
			const outputs = getRadio('outputs');
			if (outputs === 'yes') { criteria.hasOutputs = true; }
			if (outputs === 'no') { criteria.hasOutputs = false; }
			const executed = getRadio('executed');
			if (executed === 'yes') { criteria.executed = true; }
			if (executed === 'no') { criteria.executed = false; }
			return criteria;
		}

		function applyState(msg) {
			const c = msg.criteria || {};
			renderTags(msg.tags || [], c.tags || []);
			setRadio('kind', c.cellKind || 'any');
			if (c.hasOutputs === true) { setRadio('outputs', 'yes'); }
			else if (c.hasOutputs === false) { setRadio('outputs', 'no'); }
			else { setRadio('outputs', 'any'); }
			if (c.executed === true) { setRadio('executed', 'yes'); }
			else if (c.executed === false) { setRadio('executed', 'no'); }
			else { setRadio('executed', 'any'); }
			clearBtn.disabled = !msg.filterActive;
			document.body.classList.toggle('filter-active', !!msg.filterActive);
			statusEl.classList.toggle('active', !!msg.filterActive);
			if (msg.filterActive && msg.matchCount != null && msg.totalCount != null) {
				statusEl.textContent = 'Showing ' + msg.matchCount + '/' + msg.totalCount + ' cells';
			} else {
				statusEl.textContent = msg.filterActive ? 'Filter active' : '';
			}
		}

		applyBtn.addEventListener('click', () => {
			vscode.postMessage({ type: 'apply', criteria: collectCriteria() });
		});
		clearBtn.addEventListener('click', () => {
			vscode.postMessage({ type: 'clear' });
		});

		window.addEventListener('message', event => {
			const msg = event.data;
			if (msg && msg.type === 'state') {
				applyState(msg);
			}
		});
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
