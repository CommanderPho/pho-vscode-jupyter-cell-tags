import { DependencyChain } from './buildChain';

export const MAX_CHAIN_HISTORY = 10;

export interface ChainSnapshot {
	id: string;
	notebookUri: string;
	targetIndex: number;
	preview: string;
	createdAt: number;
	chain: DependencyChain;
}

export class ChainHistory {
	private readonly byNotebook = new Map<string, ChainSnapshot[]>();
	private readonly activeId = new Map<string, string>();

	list(notebookUri: string): readonly ChainSnapshot[] {
		return this.byNotebook.get(notebookUri) ?? [];
	}

	getActiveId(notebookUri: string): string | undefined {
		return this.activeId.get(notebookUri);
	}

	getActive(notebookUri: string): ChainSnapshot | undefined {
		const id = this.activeId.get(notebookUri);
		if (!id) {
			return undefined;
		}
		return this.get(notebookUri, id);
	}

	get(notebookUri: string, id: string): ChainSnapshot | undefined {
		return this.list(notebookUri).find((snapshot) => snapshot.id === id);
	}

	push(
		notebookUri: string,
		targetIndex: number,
		preview: string,
		chain: DependencyChain
	): ChainSnapshot {
		const snapshot: ChainSnapshot = {
			id: `${Date.now()}-${targetIndex}-${Math.random().toString(36).slice(2, 8)}`,
			notebookUri,
			targetIndex,
			preview,
			createdAt: Date.now(),
			chain,
		};
		const list = [...(this.byNotebook.get(notebookUri) ?? [])];
		list.unshift(snapshot);
		if (list.length > MAX_CHAIN_HISTORY) {
			list.length = MAX_CHAIN_HISTORY;
		}
		this.byNotebook.set(notebookUri, list);
		this.activeId.set(notebookUri, snapshot.id);
		return snapshot;
	}

	activate(notebookUri: string, id: string): ChainSnapshot | undefined {
		const snapshot = this.get(notebookUri, id);
		if (!snapshot) {
			return undefined;
		}
		this.activeId.set(notebookUri, id);
		return snapshot;
	}

	clearActive(notebookUri: string): void {
		this.activeId.delete(notebookUri);
	}
}

export function firstLinePreview(text: string, max = 48): string {
	const line = text
		.split(/\r?\n/)
		.map((entry) => entry.trim())
		.find((entry) => entry.length > 0) ?? '';
	if (line.length <= max) {
		return line;
	}
	return `${line.slice(0, max - 1)}…`;
}
