/**
 * Cell-level prerequisite graph.
 * Edges point only at earlier cells: the latest cell that defines or mutates
 * each used name. Hop 1 is a direct prerequisite of the target.
 */

export interface CellSymbolInfo {
	defines: string[];
	uses: string[];
	mutations: string[];
	parseError: boolean;
	starImport: boolean;
	dynamicExec: boolean;
}

export interface ChainTreeNode {
	cellIndex: number;
	hop: number;
	/** Names this cell supplies to its parent. Empty on the target. */
	names: string[];
	unresolved: string[];
	parseError: boolean;
	starImport: boolean;
	dynamicExec: boolean;
	children: ChainTreeNode[];
}

export interface HopEntry {
	cellIndex: number;
	hop: number;
}

export interface DependencyChain {
	targetIndex: number;
	/** Prerequisite cells only (hop >= 1), nearest hop first. */
	hops: HopEntry[];
	tree: ChainTreeNode;
	/** Names used by the target with no earlier definition. */
	unresolved: string[];
	/** Cells before the target that contain `import *`. */
	starImportCells: number[];
	/** Python cells before the target that failed to parse. */
	parseErrorCells: number[];
}

export function emptySymbols(): CellSymbolInfo {
	return {
		defines: [],
		uses: [],
		mutations: [],
		parseError: false,
		starImport: false,
		dynamicExec: false,
	};
}

export function buildDependencyChain(
	symbols: readonly CellSymbolInfo[],
	targetIndex: number
): DependencyChain {
	if (targetIndex < 0) {
		throw new Error('Target cell index is invalid.');
	}

	const latest = new Map<string, number>();
	const edges = new Map<number, Map<number, string[]>>();
	const unresolvedByCell = new Map<number, string[]>();

	const lastCell = Math.min(targetIndex, symbols.length - 1);
	for (let i = 0; i <= lastCell; i++) {
		const info = symbols[i] ?? emptySymbols();
		const unresolved: string[] = [];
		for (const name of info.uses) {
			const provider = latest.get(name);
			if (provider === undefined || provider >= i) {
				unresolved.push(name);
				continue;
			}
			addEdge(edges, i, provider, name);
		}
		unresolved.sort();
		unresolvedByCell.set(i, unresolved);

		for (const name of info.defines) {
			latest.set(name, i);
		}
		for (const name of info.mutations) {
			latest.set(name, i);
		}
	}

	const hop = new Map<number, number>();
	const parent = new Map<number, number>();
	const edgeNames = new Map<number, string[]>();
	hop.set(targetIndex, 0);

	const queue: number[] = [targetIndex];
	while (queue.length > 0) {
		const cell = queue.shift()!;
		const deps = edges.get(cell);
		if (!deps) {
			continue;
		}
		const providers = [...deps.keys()].sort((a, b) => a - b);
		for (const provider of providers) {
			if (hop.has(provider)) {
				continue;
			}
			hop.set(provider, (hop.get(cell) ?? 0) + 1);
			parent.set(provider, cell);
			const names = [...(deps.get(provider) ?? [])].sort();
			edgeNames.set(provider, names);
			queue.push(provider);
		}
	}

	const hops: HopEntry[] = [];
	for (const [cellIndex, distance] of hop) {
		if (distance >= 1) {
			hops.push({ cellIndex, hop: distance });
		}
	}
	hops.sort((a, b) => a.hop - b.hop || a.cellIndex - b.cellIndex);

	const starImportCells: number[] = [];
	const parseErrorCells: number[] = [];
	const limit = Math.min(targetIndex, symbols.length);
	for (let i = 0; i < limit; i++) {
		const info = symbols[i];
		if (!info) {
			continue;
		}
		if (info.starImport) {
			starImportCells.push(i);
		}
		if (info.parseError) {
			parseErrorCells.push(i);
		}
	}

	const targetUnresolved = unresolvedByCell.get(targetIndex) ?? [];

	function makeNode(index: number): ChainTreeNode {
		const info = symbols[index] ?? emptySymbols();
		const childIndexes = [...parent.entries()]
			.filter(([, owner]) => owner === index)
			.map(([child]) => child)
			.sort((a, b) => a - b);
		return {
			cellIndex: index,
			hop: hop.get(index) ?? 0,
			names: edgeNames.get(index) ?? [],
			unresolved: unresolvedByCell.get(index) ?? [],
			parseError: info.parseError,
			starImport: info.starImport,
			dynamicExec: info.dynamicExec,
			children: childIndexes.map(makeNode),
		};
	}

	return {
		targetIndex,
		hops,
		tree: makeNode(targetIndex),
		unresolved: targetUnresolved,
		starImportCells,
		parseErrorCells,
	};
}

function addEdge(
	edges: Map<number, Map<number, string[]>>,
	from: number,
	to: number,
	name: string
): void {
	let providers = edges.get(from);
	if (!providers) {
		providers = new Map();
		edges.set(from, providers);
	}
	const names = providers.get(to);
	if (!names) {
		providers.set(to, [name]);
	} else if (!names.includes(name)) {
		names.push(name);
	}
}
