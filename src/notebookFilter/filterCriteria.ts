import * as vscode from 'vscode';
import { getCellTags } from '../helper';

export type NotebookFilterCriteria = {
	/** If set/non-empty: cell must have ANY selected tag (OR). */
	tags?: string[];
	cellKind?: 'code' | 'markup';
	/** Code cells: outputs.length > 0; markup treated as false. */
	hasOutputs?: boolean;
	/** True if executionSummary has executionOrder, timing, or success. */
	executed?: boolean;
};

export function isFilterActive(criteria: NotebookFilterCriteria | undefined): boolean {
	if (!criteria) {
		return false;
	}
	if (criteria.tags && criteria.tags.length > 0) {
		return true;
	}
	if (criteria.cellKind !== undefined) {
		return true;
	}
	if (criteria.hasOutputs !== undefined) {
		return true;
	}
	if (criteria.executed !== undefined) {
		return true;
	}
	return false;
}

export function cellHasOutputs(cell: vscode.NotebookCell): boolean {
	return cell.kind === vscode.NotebookCellKind.Code && cell.outputs.length > 0;
}

export function cellIsExecuted(cell: vscode.NotebookCell): boolean {
	const summary = cell.executionSummary;
	if (!summary) {
		return false;
	}
	if (summary.executionOrder != null) {
		return true;
	}
	if (summary.timing?.endTime != null || summary.timing?.startTime != null) {
		return true;
	}
	if (summary.success !== undefined) {
		return true;
	}
	return false;
}

/**
 * Match when every set criterion field passes.
 * Tags use OR (any selected tag); other fields AND with each other.
 */
export function cellMatchesFilter(cell: vscode.NotebookCell, criteria: NotebookFilterCriteria): boolean {
	if (criteria.tags && criteria.tags.length > 0) {
		const cellTags = getCellTags(cell);
		const cellTagSet = new Set(cellTags.map(t => t.toLowerCase()));
		const anyTag = criteria.tags.some(t => cellTagSet.has(t.toLowerCase()));
		if (!anyTag) {
			return false;
		}
	}

	if (criteria.cellKind !== undefined) {
		const kind = cell.kind === vscode.NotebookCellKind.Code ? 'code' : 'markup';
		if (kind !== criteria.cellKind) {
			return false;
		}
	}

	if (criteria.hasOutputs !== undefined) {
		if (cellHasOutputs(cell) !== criteria.hasOutputs) {
			return false;
		}
	}

	if (criteria.executed !== undefined) {
		if (cellIsExecuted(cell) !== criteria.executed) {
			return false;
		}
	}

	return true;
}

export function summarizeCriteria(criteria: NotebookFilterCriteria): string {
	const parts: string[] = [];
	if (criteria.tags && criteria.tags.length > 0) {
		parts.push(`tags: ${criteria.tags.join(', ')}`);
	}
	if (criteria.cellKind !== undefined) {
		parts.push(`kind: ${criteria.cellKind}`);
	}
	if (criteria.hasOutputs !== undefined) {
		parts.push(`outputs: ${criteria.hasOutputs ? 'yes' : 'no'}`);
	}
	if (criteria.executed !== undefined) {
		parts.push(`executed: ${criteria.executed ? 'yes' : 'no'}`);
	}
	return parts.length > 0 ? parts.join('; ') : '(none)';
}
