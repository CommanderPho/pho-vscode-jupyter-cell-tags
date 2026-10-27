import * as vscode from 'vscode';
import { log } from './logging';

/** Optional feature keys under `jupyter-cell-tags.features.*`. */
export type FeatureKey =
	| 'jumpbacks'
	| 'errorNavigation'
	| 'outlineSync'
	| 'customOutline'
	| 'scrollbarDecorators'
	| 'jupyterEnhancements'
	| 'gitDiff'
	| 'dependencyChain'
	| 'notebookFilter'
	| 'ringMeJupyter'
	| 'durableKernel'
	| 'cellHistory'
	| 'cellExecutionTracking';

const FEATURE_DEFAULTS: Record<FeatureKey, boolean> = {
	jumpbacks: false,
	errorNavigation: false,
	outlineSync: true,
	customOutline: true,
	scrollbarDecorators: true,
	jupyterEnhancements: true,
	gitDiff: true,
	dependencyChain: true,
	notebookFilter: true,
	ringMeJupyter: true,
	durableKernel: true,
	cellHistory: false,
	cellExecutionTracking: true,
};

/** Deprecated setting key → Features key (relative to `jupyter-cell-tags`). */
const DEPRECATED_MIGRATIONS: ReadonlyArray<{ oldKey: string; feature: FeatureKey }> = [
	{ oldKey: 'enableJumpbacks', feature: 'jumpbacks' },
	{ oldKey: 'enableErrorNavigation', feature: 'errorNavigation' },
	{ oldKey: 'outlineSync.enabled', feature: 'outlineSync' },
	{ oldKey: 'customOutline.enabled', feature: 'customOutline' },
	{ oldKey: 'scrollbarDecorators.enabled', feature: 'scrollbarDecorators' },
];

/** Features that only register at activate and need a window reload after toggling. */
const RELOAD_REQUIRED_FEATURES: ReadonlySet<FeatureKey> = new Set([
	'jumpbacks',
	'errorNavigation',
	'outlineSync',
	'customOutline',
	'jupyterEnhancements',
	'gitDiff',
	'dependencyChain',
	'notebookFilter',
	'ringMeJupyter',
	'durableKernel',
	'cellHistory',
	'cellExecutionTracking',
]);

function featuresConfigKey(feature: FeatureKey): string {
	return `features.${feature}`;
}

function hasExplicitValue(
	inspect: { globalValue?: boolean; workspaceValue?: boolean; workspaceFolderValue?: boolean } | undefined
): boolean {
	if (!inspect) {
		return false;
	}
	return (
		inspect.globalValue !== undefined ||
		inspect.workspaceValue !== undefined ||
		inspect.workspaceFolderValue !== undefined
	);
}

/**
 * Whether an optional feature is enabled. Reads `jupyter-cell-tags.features.<name>`.
 */
export function isFeatureEnabled(feature: FeatureKey): boolean {
	const config = vscode.workspace.getConfiguration('jupyter-cell-tags');
	return config.get<boolean>(featuresConfigKey(feature), FEATURE_DEFAULTS[feature]) !== false;
}

/**
 * One-shot migrate: if a removed/legacy enable key still has a user/workspace value
 * in settings.json, copy it into the Features key (when unset) and clear the old key.
 * Legacy keys are no longer contributed, so they do not appear in the Settings UI.
 */
export async function migrateDeprecatedFeatureSettings(): Promise<void> {
	const config = vscode.workspace.getConfiguration('jupyter-cell-tags');

	for (const { oldKey, feature } of DEPRECATED_MIGRATIONS) {
		const newKey = featuresConfigKey(feature);
		const oldInspect = config.inspect<boolean>(oldKey);
		const newInspect = config.inspect<boolean>(newKey);

		if (!oldInspect || !hasExplicitValue(oldInspect)) {
			continue;
		}

		const targets: Array<{ value: boolean | undefined; target: vscode.ConfigurationTarget }> = [
			{ value: oldInspect.workspaceFolderValue, target: vscode.ConfigurationTarget.WorkspaceFolder },
			{ value: oldInspect.workspaceValue, target: vscode.ConfigurationTarget.Workspace },
			{ value: oldInspect.globalValue, target: vscode.ConfigurationTarget.Global },
		];

		for (const { value, target } of targets) {
			if (value === undefined) {
				continue;
			}
			try {
				// Only write Features key when that scope has no explicit value yet
				const scopeHasNew =
					(target === vscode.ConfigurationTarget.WorkspaceFolder &&
						newInspect?.workspaceFolderValue !== undefined) ||
					(target === vscode.ConfigurationTarget.Workspace &&
						newInspect?.workspaceValue !== undefined) ||
					(target === vscode.ConfigurationTarget.Global && newInspect?.globalValue !== undefined);

				if (!scopeHasNew) {
					await config.update(newKey, value, target);
					log(`Migrated ${oldKey}=${value} → ${newKey} (${vscode.ConfigurationTarget[target]})`);
				}

				// Remove legacy key from settings.json so it no longer lingers
				await config.update(oldKey, undefined, target);
				log(`Cleared legacy setting ${oldKey} (${vscode.ConfigurationTarget[target]})`);
			} catch (err) {
				log(`Failed to migrate/clear ${oldKey} → ${newKey}: ${err}`);
			}
		}
	}
}

/**
 * Prompt to reload the window when a Features toggle that needs re-activation changes.
 */
export function registerFeatureReloadPrompt(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(async (e) => {
			if (!e.affectsConfiguration('jupyter-cell-tags.features')) {
				return;
			}

			const needsReload = [...RELOAD_REQUIRED_FEATURES].some((feature) =>
				e.affectsConfiguration(`jupyter-cell-tags.features.${feature}`)
			);
			if (!needsReload) {
				return;
			}

			const choice = await vscode.window.showInformationMessage(
				'Some Jupyter Cell Tags features require a window reload to apply.',
				'Reload Window'
			);
			if (choice === 'Reload Window') {
				await vscode.commands.executeCommand('workbench.action.reloadWindow');
			}
		})
	);
}
