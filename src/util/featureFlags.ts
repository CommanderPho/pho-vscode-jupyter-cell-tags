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

/** Features settings shown in the status-bar picker, including toolbar-only flags. */
export type FeatureSettingKey = FeatureKey | 'cellNavigation';

export const FEATURE_KEYS: readonly FeatureKey[] = [
	'jumpbacks',
	'errorNavigation',
	'outlineSync',
	'customOutline',
	'scrollbarDecorators',
	'jupyterEnhancements',
	'gitDiff',
	'dependencyChain',
	'notebookFilter',
	'ringMeJupyter',
	'durableKernel',
	'cellHistory',
	'cellExecutionTracking',
];

export const FEATURE_SETTING_KEYS: readonly FeatureSettingKey[] = [
	...FEATURE_KEYS,
	'cellNavigation',
];

/** Labels match `package.json` Features descriptions. */
export const FEATURE_SETTING_LABELS: Record<FeatureSettingKey, string> = {
	jumpbacks: '↩️ Jumpbacks: bookmark cells or text lines and jump back to them',
	errorNavigation: 'Previous/Next Error Cell navigation commands',
	outlineSync: 'Sync the Outline pane with programmatic cell selections',
	customOutline: '★ Custom notebook outline view with multi-select',
	scrollbarDecorators: '🏷️ Scrollbar markers for tag locations in the notebook',
	jupyterEnhancements: 'Cell execution visuals (borders, flash, background) and layout helpers',
	gitDiff: '🔀 Highlight and list cells changed vs a git commit',
	dependencyChain: '⛓️ Show variable dependency chains between cells',
	notebookFilter: '🔍 Collapse/filter notebook cells by criteria',
	ringMeJupyter: 'Email notifications when tagged cells finish executing',
	durableKernel: 'Durable Jupyter server that survives Extension Host restart',
	cellHistory: 'Write cellCreated/cellEdited timestamps into cell metadata (can dirty the notebook while typing)',
	cellExecutionTracking: '▶️ Track executed cells in a sidebar view and record execution history for the session',
	cellNavigation: 'Show the 🧭 Cell Navigation toolbar button in the notebook toolbar',
};

const FEATURE_DEFAULTS: Record<FeatureKey, boolean> = {
	jumpbacks: false,
	errorNavigation: true,
	outlineSync: true,
	customOutline: true,
	scrollbarDecorators: false,
	jupyterEnhancements: false,
	gitDiff: true,
	dependencyChain: true,
	notebookFilter: true,
	ringMeJupyter: false,
	durableKernel: true,
	cellHistory: true,
	cellExecutionTracking: true,
};

const FEATURE_SETTING_DEFAULTS: Record<FeatureSettingKey, boolean> = {
	...FEATURE_DEFAULTS,
	cellNavigation: false,
};

/** Deprecated setting key → Features key (relative to `jupyter-cell-tags`). */
const DEPRECATED_MIGRATIONS: ReadonlyArray<{ oldKey: string; feature: FeatureKey }> = [
	{ oldKey: 'enableJumpbacks', feature: 'jumpbacks' },
	{ oldKey: 'enableErrorNavigation', feature: 'errorNavigation' },
	{ oldKey: 'outlineSync.enabled', feature: 'outlineSync' },
	{ oldKey: 'customOutline.enabled', feature: 'customOutline' },
	{ oldKey: 'scrollbarDecorators.enabled', feature: 'scrollbarDecorators' },
];

function featuresConfigKey(feature: FeatureSettingKey): string {
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
	return isFeatureSettingEnabled(feature);
}

export function isFeatureSettingEnabled(key: FeatureSettingKey): boolean {
	const config = vscode.workspace.getConfiguration('jupyter-cell-tags');
	return config.get<boolean>(featuresConfigKey(key), FEATURE_SETTING_DEFAULTS[key]) !== false;
}

export function countEnabledFeatureSettings(): { enabled: number; total: number } {
	const total = FEATURE_SETTING_KEYS.length;
	const enabled = FEATURE_SETTING_KEYS.filter((key) => isFeatureSettingEnabled(key)).length;
	return { enabled, total };
}

/**
 * Write `jupyter-cell-tags.features.<key>` to the most specific scope that
 * already has an explicit value; otherwise Global.
 */
export async function updateFeatureSetting(key: FeatureSettingKey, enabled: boolean): Promise<void> {
	const config = vscode.workspace.getConfiguration('jupyter-cell-tags');
	const settingKey = featuresConfigKey(key);
	const inspect = config.inspect<boolean>(settingKey);
	let target = vscode.ConfigurationTarget.Global;
	if (inspect?.workspaceFolderValue !== undefined) {
		target = vscode.ConfigurationTarget.WorkspaceFolder;
	} else if (inspect?.workspaceValue !== undefined) {
		target = vscode.ConfigurationTarget.Workspace;
	}
	await config.update(settingKey, enabled, target);
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

