import * as vscode from 'vscode';
import { FILTER_ACCENT_CSS } from './filterDecorators';
import { NotebookFilterCriteria } from './filterCriteria';

export type FilteredBarStateMessage = {
	type: 'state';
	tags: string[];
	criteria: NotebookFilterCriteria;
	matchCount?: number;
	totalCount?: number;
	filterActive: boolean;
	sourceClosed: boolean;
	sourceName?: string;
	warning?: string;
};

export type FilteredBarApplyMessage = {
	type: 'apply';
	criteria: NotebookFilterCriteria;
};

export type FilteredBarClearMessage = {
	type: 'clear';
};

export type FilteredBarToExtensionMessage = FilteredBarApplyMessage | FilteredBarClearMessage;

function getNonce(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let nonce = '';
	for (let i = 0; i < 32; i++) {
		nonce += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return nonce;
}

export function getFilteredNotebookBarHtml(webview: vscode.Webview): string {
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
	<title>Filtered Cells</title>
	<style>
		:root {
			--filter-accent: ${FILTER_ACCENT_CSS};
			--filter-accent-hover: #ffb733;
		}
		html, body {
			margin: 0;
			padding: 0;
			height: 100%;
		}
		body {
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			background-color: var(--vscode-editor-background);
			padding: 8px 12px;
			box-sizing: border-box;
			border-bottom: 2px solid transparent;
		}
		body.filter-active {
			border-bottom-color: var(--filter-accent);
		}
		.bar {
			display: flex;
			flex-wrap: wrap;
			gap: 10px 18px;
			align-items: flex-start;
		}
		.group {
			display: flex;
			flex-wrap: wrap;
			gap: 6px 10px;
			align-items: center;
			min-width: 0;
		}
		.label {
			font-size: 11px;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.04em;
			color: var(--vscode-descriptionForeground);
			white-space: nowrap;
		}
		.tags {
			display: flex;
			flex-wrap: wrap;
			gap: 6px 10px;
			max-height: 4.8em;
			overflow-y: auto;
		}
		.tag-row, .radio-row {
			display: flex;
			align-items: center;
			gap: 4px;
			cursor: pointer;
			user-select: none;
			white-space: nowrap;
		}
		.muted {
			color: var(--vscode-descriptionForeground);
			font-style: italic;
		}
		.actions {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
			align-items: center;
			margin-left: auto;
		}
		button {
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			padding: 3px 10px;
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
		button:disabled {
			opacity: 0.5;
			cursor: default;
		}
		.status {
			color: var(--vscode-descriptionForeground);
			font-size: 12px;
			min-height: 1.2em;
		}
		.status.active {
			color: var(--filter-accent);
			font-weight: 600;
		}
		.warning {
			width: 100%;
			color: var(--vscode-editorWarning-foreground, #cca700);
			font-size: 12px;
		}
		input[type="checkbox"], input[type="radio"] {
			accent-color: var(--filter-accent);
		}
	</style>
</head>
<body>
	<div class="bar">
		<div class="group">
			<span class="label">Tags</span>
			<div id="tags" class="tags"></div>
		</div>
		<div class="group">
			<span class="label">Kind</span>
			<label class="radio-row"><input type="radio" name="kind" value="any" checked> Any</label>
			<label class="radio-row"><input type="radio" name="kind" value="code"> Code</label>
			<label class="radio-row"><input type="radio" name="kind" value="markup"> Markdown</label>
		</div>
		<div class="group">
			<span class="label">Outputs</span>
			<label class="radio-row"><input type="radio" name="outputs" value="any" checked> Any</label>
			<label class="radio-row"><input type="radio" name="outputs" value="yes"> Yes</label>
			<label class="radio-row"><input type="radio" name="outputs" value="no"> No</label>
		</div>
		<div class="group">
			<span class="label">Executed</span>
			<label class="radio-row"><input type="radio" name="executed" value="any" checked> Any</label>
			<label class="radio-row"><input type="radio" name="executed" value="yes"> Yes</label>
			<label class="radio-row"><input type="radio" name="executed" value="no"> No</label>
		</div>
		<div class="actions">
			<button class="primary" id="applyBtn" data-testid="filtered-notebook-apply">Filter</button>
			<button class="secondary" id="clearBtn" data-testid="filtered-notebook-clear" disabled>Clear</button>
			<div class="status" id="status"></div>
		</div>
		<div class="warning" id="warning"></div>
	</div>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const tagsEl = document.getElementById('tags');
		const statusEl = document.getElementById('status');
		const warningEl = document.getElementById('warning');
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
				const empty = document.createElement('span');
				empty.className = 'muted';
				empty.textContent = 'No tags';
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
			clearBtn.disabled = !msg.filterActive || !!msg.sourceClosed;
			applyBtn.disabled = !!msg.sourceClosed;
			document.body.classList.toggle('filter-active', !!msg.filterActive);
			statusEl.classList.toggle('active', !!msg.filterActive);
			if (msg.filterActive && msg.matchCount != null && msg.totalCount != null) {
				statusEl.textContent = 'Showing ' + msg.matchCount + '/' + msg.totalCount + ' cells';
			} else {
				statusEl.textContent = msg.sourceName ? ('From ' + msg.sourceName) : '';
			}
			warningEl.textContent = msg.warning || (msg.sourceClosed ? 'Source notebook is closed. Refresh is unavailable.' : '');
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
