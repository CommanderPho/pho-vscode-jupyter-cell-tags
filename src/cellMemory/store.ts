import * as vscode from 'vscode';
import { MemoryBreakdown } from './types';

/**
 * Session-only store of per-cell kernel RSS samples.
 * Keyed conceptually by cell URI + execution order; also indexed for UI lookups.
 */
export class MemoryBreakdownStore {
	private readonly byOrder = new Map<number, MemoryBreakdown>();
	private readonly byCellUri = new Map<string, MemoryBreakdown[]>();
	private nextOrder = 1;
	private readonly _onDidChange = new vscode.EventEmitter<MemoryBreakdown>();
	readonly onDidChange = this._onDidChange.event;

	allocateExecutionOrder(): number {
		return this.nextOrder++;
	}

	add(result: MemoryBreakdown): void {
		this.byOrder.set(result.executionOrder, result);
		const list = this.byCellUri.get(result.cellUri) ?? [];
		list.push(result);
		this.byCellUri.set(result.cellUri, list);
		this._onDidChange.fire(result);
	}

	getByExecutionOrder(executionOrder: number): MemoryBreakdown | undefined {
		return this.byOrder.get(executionOrder);
	}

	/** Chronological samples for a cell document URI. */
	getForCell(cellUri: string): readonly MemoryBreakdown[] {
		return this.byCellUri.get(cellUri) ?? [];
	}

	getLatestForCell(cellUri: string): MemoryBreakdown | undefined {
		const list = this.byCellUri.get(cellUri);
		if (!list || list.length === 0) {
			return undefined;
		}
		return list[list.length - 1];
	}

	getAll(): readonly MemoryBreakdown[] {
		return [...this.byOrder.values()].sort((a, b) => a.executionOrder - b.executionOrder);
	}

	clear(): void {
		this.byOrder.clear();
		this.byCellUri.clear();
		this.nextOrder = 1;
	}

	dispose(): void {
		this._onDidChange.dispose();
		this.clear();
	}
}

/** Module singleton used by tracker, status bar, and Executed Cells tree. */
let sharedStore: MemoryBreakdownStore | undefined;

export function getMemoryBreakdownStore(): MemoryBreakdownStore | undefined {
	return sharedStore;
}

export function setMemoryBreakdownStore(store: MemoryBreakdownStore | undefined): void {
	sharedStore = store;
}
