import * as vscode from 'vscode';
import { getKernelForNotebook, sampleKernelRss, MemoryLogger } from './sampler';
import { MemoryBreakdownStore } from './store';
import { MemoryBreakdown } from './types';

/** NotebookCellExecutionState: Idle = 1, Pending = 2, Executing = 3 */
const CellExecutionState = {
	Idle: 1,
	Pending: 2,
	Executing: 3,
} as const;

interface InFlight {
	cell: vscode.NotebookCell;
	cellUri: string;
	executionOrder: number;
	beforePromise: Promise<number | undefined>;
	beforeBytes?: number;
	/** Serialize after-sample until before finishes. */
	startedAt: number;
}

/**
 * Hooks notebook cell execution state (or executionSummary fallback) and samples kernel RSS.
 */
export class CellMemoryTracker implements vscode.Disposable {
	private readonly disposables: vscode.Disposable[] = [];
	private readonly inFlight = new Map<string, InFlight>();
	private readonly sampleGate: { chain: Promise<void> } = { chain: Promise.resolve() };
	private loggedMissingApi = false;
	private disposed = false;

	constructor(
		private readonly store: MemoryBreakdownStore,
		private readonly logger: MemoryLogger
	) {}

	activate(context: vscode.ExtensionContext): void {
		let hasExecutionStateApi = false;
		try {
			interface NotebookCellExecutionStateChangeEvent {
				cell: vscode.NotebookCell;
				state: number;
			}
			const notebooksAny = vscode.notebooks as any;
			const onStateChange = notebooksAny?.onDidChangeNotebookCellExecutionState;
			if (typeof onStateChange === 'function') {
				hasExecutionStateApi = true;
				this.disposables.push(
					onStateChange.call(notebooksAny, (e: NotebookCellExecutionStateChangeEvent) => {
						void this.handleExecutionStateChange(e.cell, e.state);
					})
				);
				this.logger.appendLine('[cellMemory] Using notebookCellExecutionState API.');
			}
		} catch (err) {
			this.logger.appendLine(`[cellMemory] notebookCellExecutionState unavailable: ${err}`);
		}

		if (!hasExecutionStateApi) {
			if (!this.loggedMissingApi) {
				this.loggedMissingApi = true;
				this.logger.appendLine(
					'[cellMemory] Execution-state API missing; falling back to executionSummary (before sample skipped).'
				);
			}
			this.disposables.push(
				vscode.workspace.onDidChangeNotebookDocument((e) => {
					for (const change of e.cellChanges) {
						const endTime = change.executionSummary?.timing?.endTime;
						if (endTime === undefined) {
							continue;
						}
						if (change.cell.kind !== vscode.NotebookCellKind.Code) {
							continue;
						}
						void this.finalizeWithoutBefore(change.cell);
					}
				})
			);
		}

		context.subscriptions.push(this);
	}

	private async handleExecutionStateChange(cell: vscode.NotebookCell, state: number): Promise<void> {
		if (this.disposed) {
			return;
		}
		if (cell.kind !== vscode.NotebookCellKind.Code) {
			return;
		}
		const cellUri = cell.document.uri.toString();

		if (state === CellExecutionState.Pending || state === CellExecutionState.Executing) {
			if (this.inFlight.has(cellUri)) {
				return;
			}
			await this.beginSample(cell);
			return;
		}

		if (state === CellExecutionState.Idle) {
			await this.finalizeSample(cell);
		}
	}

	private async beginSample(cell: vscode.NotebookCell): Promise<void> {
		const cellUri = cell.document.uri.toString();
		if (this.inFlight.has(cellUri)) {
			return;
		}

		const executionOrder = this.store.allocateExecutionOrder();
		const beforePromise = this.enqueue(async () => {
			const kernel = await getKernelForNotebook(cell.notebook.uri);
			if (!kernel) {
				this.logger.appendLine(`[cellMemory] No Python kernel for before-sample (cell ${cell.index}).`);
				return undefined;
			}
			const sample = await sampleKernelRss(kernel, this.logger);
			if (!sample) {
				return undefined;
			}
			this.logger.appendLine(
				`[cellMemory] before cell ${cell.index}: rss=${sample.rssBytes} peak=${sample.peakBytes}`
			);
			return sample.rssBytes;
		});

		const flight: InFlight = {
			cell,
			cellUri,
			executionOrder,
			beforePromise,
			startedAt: Date.now(),
		};
		this.inFlight.set(cellUri, flight);

		const beforeBytes = await beforePromise;
		flight.beforeBytes = beforeBytes;
	}

	private async finalizeSample(cell: vscode.NotebookCell): Promise<void> {
		const cellUri = cell.document.uri.toString();
		const flight = this.inFlight.get(cellUri);
		if (!flight) {
			// Idle without a matching pending/executing begin — ignore (avoid spurious samples).
			return;
		}
		this.inFlight.delete(cellUri);

		const beforeBytes = flight.beforeBytes ?? (await flight.beforePromise);

		await this.enqueue(async () => {
			const kernel = await getKernelForNotebook(cell.notebook.uri);
			if (!kernel) {
				this.logger.appendLine(`[cellMemory] No Python kernel for after-sample (cell ${cell.index}).`);
				return;
			}
			const sample = await sampleKernelRss(kernel, this.logger);
			if (!sample) {
				return;
			}
			this.logger.appendLine(
				`[cellMemory] after cell ${cell.index}: rss=${sample.rssBytes} peak=${sample.peakBytes}`
			);

			const result: MemoryBreakdown = {
				cellUri,
				notebookUri: cell.notebook.uri.toString(),
				cellIndex: cell.index,
				executionOrder: flight.executionOrder,
				jupyterExecutionOrder: cell.executionSummary?.executionOrder,
				beforeBytes,
				afterBytes: sample.rssBytes,
				peakBytes: sample.peakBytes,
				deltaBytes: beforeBytes !== undefined ? sample.rssBytes - beforeBytes : undefined,
				finishedAt: Date.now(),
				beforeSkipped: beforeBytes === undefined,
			};
			this.store.add(result);
		});
	}

	private async finalizeWithoutBefore(cell: vscode.NotebookCell): Promise<void> {
		const cellUri = cell.document.uri.toString();
		if (this.inFlight.has(cellUri)) {
			await this.finalizeSample(cell);
			return;
		}

		const executionOrder = this.store.allocateExecutionOrder();
		await this.enqueue(async () => {
			const kernel = await getKernelForNotebook(cell.notebook.uri);
			if (!kernel) {
				this.logger.appendLine(
					`[cellMemory] No Python kernel for after-only sample (cell ${cell.index}).`
				);
				return;
			}
			const sample = await sampleKernelRss(kernel, this.logger);
			if (!sample) {
				return;
			}
			this.logger.appendLine(
				`[cellMemory] after-only cell ${cell.index}: rss=${sample.rssBytes} peak=${sample.peakBytes}`
			);
			const result: MemoryBreakdown = {
				cellUri,
				notebookUri: cell.notebook.uri.toString(),
				cellIndex: cell.index,
				executionOrder,
				jupyterExecutionOrder: cell.executionSummary?.executionOrder,
				afterBytes: sample.rssBytes,
				peakBytes: sample.peakBytes,
				finishedAt: Date.now(),
				beforeSkipped: true,
			};
			this.store.add(result);
		});
	}

	/** Serialize kernel probes so multi-cell runs stay ordered. */
	private enqueue<T>(fn: () => Promise<T>): Promise<T> {
		const run = this.sampleGate.chain.then(fn, fn);
		this.sampleGate.chain = run.then(
			() => undefined,
			() => undefined
		);
		return run;
	}

	dispose(): void {
		this.disposed = true;
		this.inFlight.clear();
		for (const d of this.disposables) {
			d.dispose();
		}
		this.disposables.length = 0;
	}
}
