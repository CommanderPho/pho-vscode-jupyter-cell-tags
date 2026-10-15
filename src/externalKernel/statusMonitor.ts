import * as vscode from 'vscode';
import { Jupyter, Kernel } from '@vscode/jupyter-extension';
import { DurableServerManager } from './DurableServerManager';

export class DurableKernelStatusMonitor implements vscode.Disposable {
	private readonly statusBar: vscode.StatusBarItem;
	private readonly disposables: vscode.Disposable[] = [];
	private pollTimer: ReturnType<typeof setInterval> | undefined;
	private kernelStatusSub: vscode.Disposable | undefined;
	private lastKernelStatus = '';
	private attachedKernel: Kernel | undefined;

	constructor(private readonly manager: DurableServerManager) {
		this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 95);
		this.statusBar.command = 'jupyter-cell-tags.externalKernel.statusMenu';
		this.disposables.push(this.statusBar);

		this.disposables.push(
			this.manager.onDidChangeServers(() => void this.refresh()),
			vscode.window.onDidChangeActiveNotebookEditor(() => void this.refresh()),
			vscode.workspace.onDidOpenNotebookDocument(() => this.ensurePolling()),
			vscode.workspace.onDidCloseNotebookDocument(() => this.ensurePolling())
		);

		this.ensurePolling();
		void this.refresh();
	}

	private ensurePolling(): void {
		const shouldPoll =
			this.manager.getServers().length > 0 || vscode.workspace.notebookDocuments.length > 0;
		if (shouldPoll && !this.pollTimer) {
			this.pollTimer = setInterval(() => {
				void this.manager.refreshHealth().then(() => this.refresh());
			}, 5000);
		} else if (!shouldPoll && this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = undefined;
		}
	}

	async refresh(): Promise<void> {
		this.ensurePolling();
		const kernelLabel = await this.resolveKernelStatusLabel();
		await this.syncNotebookHasKernelContext(!!this.attachedKernel);

		const servers = this.manager.getServers();
		if (servers.length === 0) {
			this.statusBar.hide();
			return;
		}

		const primary = this.manager.managedServer ?? servers[0];
		const health = this.manager.getHealth(primary.id);

		const portPart = `:${primary.port}`;
		const healthIcon =
			health === 'up' ? '$(server-environment)' : health === 'down' ? '$(error)' : '$(question)';
		const suffix = kernelLabel ? ` ${kernelLabel}` : health === 'up' ? '' : ` ${health}`;

		this.statusBar.text = `${healthIcon} Durable ${portPart}${suffix}`;
		const lines = [
			`${primary.label} — ${primary.baseUrl}`,
			primary.managed
				? `Managed process${primary.pid ? ` pid ${primary.pid}` : ''}`
				: 'Connected (external; Stop will not kill process)',
			`Health: ${health}`,
		];
		if (kernelLabel) {
			lines.push(`Notebook kernel: ${kernelLabel}`);
		}
		lines.push('Click for Start / Stop / Connect / Copy URL / Show log');
		this.statusBar.tooltip = lines.join('\n');
		this.statusBar.show();
	}

	private async syncNotebookHasKernelContext(hasKernel: boolean): Promise<void> {
		await vscode.commands.executeCommand(
			'setContext',
			'jupyter-cell-tags.externalKernel.notebookHasKernel',
			hasKernel
		);
	}

	private async resolveKernelStatusLabel(): Promise<string> {
		const editor = vscode.window.activeNotebookEditor;
		if (!editor) {
			this.detachKernelListener();
			return '';
		}

		try {
			const ext = vscode.extensions.getExtension<Jupyter>('ms-toolsai.jupyter');
			if (!ext) {
				this.detachKernelListener();
				return '';
			}
			if (!ext.isActive) {
				await ext.activate();
			}
			const kernel = await ext.exports.kernels.getKernel(editor.notebook.uri);
			if (!kernel) {
				this.detachKernelListener();
				return '';
			}
			this.attachKernelListener(kernel);
			return kernel.status;
		} catch {
			this.detachKernelListener();
			return '';
		}
	}

	private attachKernelListener(kernel: Kernel): void {
		if (this.attachedKernel === kernel && this.kernelStatusSub) {
			this.lastKernelStatus = kernel.status;
			return;
		}
		this.detachKernelListener();
		this.attachedKernel = kernel;
		this.lastKernelStatus = kernel.status;
		this.kernelStatusSub = kernel.onDidChangeStatus(() => {
			this.lastKernelStatus = kernel.status;
			void this.refresh();
		});
	}

	private detachKernelListener(): void {
		this.kernelStatusSub?.dispose();
		this.kernelStatusSub = undefined;
		this.attachedKernel = undefined;
		this.lastKernelStatus = '';
	}

	dispose(): void {
		if (this.pollTimer) {
			clearInterval(this.pollTimer);
		}
		this.detachKernelListener();
		for (const d of this.disposables) {
			d.dispose();
		}
	}
}
