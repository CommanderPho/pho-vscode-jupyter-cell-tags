import * as vscode from 'vscode';
import { getAllTagsFromActiveNotebook } from '../util/notebookSelection';
import { NotebookFilterCriteria } from './filterCriteria';

async function pickYesNoAny(title: string, placeHolder: string): Promise<boolean | undefined | 'cancelled'> {
	const pick = await vscode.window.showQuickPick(
		[
			{ label: 'Any', description: 'Do not filter on this', value: 'any' as const },
			{ label: 'Yes', value: 'yes' as const },
			{ label: 'No', value: 'no' as const }
		],
		{ title, placeHolder, ignoreFocusOut: true }
	);
	if (!pick) {
		return 'cancelled';
	}
	if (pick.value === 'any') {
		return undefined;
	}
	return pick.value === 'yes';
}

/**
 * Multi-step QuickPick to build filter criteria.
 * Returns undefined if the user cancels any step or selects no constraints.
 */
export async function promptForFilterCriteria(): Promise<NotebookFilterCriteria | undefined> {
	const knownTags = [...new Set((getAllTagsFromActiveNotebook() ?? []).flat())].sort();
	const tagItems: vscode.QuickPickItem[] = [
		{
			label: '$(close) Skip tag filter',
			description: 'Do not require any tags',
			picked: knownTags.length === 0
		},
		...knownTags.map(tag => ({ label: tag }))
	];

	const selectedTags = await vscode.window.showQuickPick(tagItems, {
		title: 'Filter Notebook Cells — Tags',
		placeHolder: 'Select tags (ANY match). Choose Skip for no tag constraint.',
		canPickMany: true,
		ignoreFocusOut: true
	});
	if (!selectedTags) {
		return undefined;
	}

	const skipTags = selectedTags.some(i => i.label.startsWith('$(close)'));
	const tags = skipTags
		? undefined
		: selectedTags.filter(i => !i.label.startsWith('$(close)')).map(i => i.label);

	const kindPick = await vscode.window.showQuickPick(
		[
			{ label: 'Any', description: 'Code or Markdown', value: 'any' as const },
			{ label: 'Code', value: 'code' as const },
			{ label: 'Markdown', value: 'markup' as const }
		],
		{
			title: 'Filter Notebook Cells — Cell Kind',
			placeHolder: 'Restrict by cell kind',
			ignoreFocusOut: true
		}
	);
	if (!kindPick) {
		return undefined;
	}

	const hasOutputs = await pickYesNoAny(
		'Filter Notebook Cells — Has Outputs',
		'Require cells that have (or lack) outputs'
	);
	if (hasOutputs === 'cancelled') {
		return undefined;
	}

	const executed = await pickYesNoAny(
		'Filter Notebook Cells — Executed',
		'Require cells that have (or have not) been executed'
	);
	if (executed === 'cancelled') {
		return undefined;
	}

	const criteria: NotebookFilterCriteria = {};
	if (!skipTags && tags && tags.length > 0) {
		criteria.tags = tags;
	}
	if (kindPick.value !== 'any') {
		criteria.cellKind = kindPick.value;
	}
	if (hasOutputs !== undefined) {
		criteria.hasOutputs = hasOutputs;
	}
	if (executed !== undefined) {
		criteria.executed = executed;
	}

	if (
		!criteria.tags &&
		criteria.cellKind === undefined &&
		criteria.hasOutputs === undefined &&
		criteria.executed === undefined
	) {
		vscode.window.showInformationMessage('No filter criteria selected.');
		return undefined;
	}

	return criteria;
}
