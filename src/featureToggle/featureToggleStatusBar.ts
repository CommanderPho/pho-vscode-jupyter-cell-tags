import * as vscode from 'vscode';
import {
	FEATURE_SETTING_KEYS,
	FEATURE_SETTING_LABELS,
	FeatureSettingKey,
	countEnabledFeatureSettings,
	isFeatureSettingEnabled,
	updateFeatureSetting,
} from '../util/featureFlags';
import { log } from '../util/logging';

interface FeaturePickItem extends vscode.QuickPickItem {
	key: FeatureSettingKey;
}

/**
 * Always-on status bar + command that toggles `jupyter-cell-tags.features.*`
 * through a multi-select Quick Pick that stays open until click-out or Escape.
 */
export function registerFeatureToggleStatusBar(context: vscode.ExtensionContext): void {
	const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
	item.command = 'jupyter-cell-tags.toggleFeatures';
	item.tooltip = 'Jupyter Cell Tags features';

	const refresh = () => {
		const { enabled, total } = countEnabledFeatureSettings();
		item.text = `$(extensions) JCT ${enabled}/${total}`;
		item.show();
	};
	refresh();

	context.subscriptions.push(item);
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('jupyter-cell-tags.features')) {
				refresh();
			}
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('jupyter-cell-tags.toggleFeatures', () => {
			showFeaturePicker();
		})
	);
}

function showFeaturePicker(): void {
	const pick = vscode.window.createQuickPick<FeaturePickItem>();
	pick.canSelectMany = true;
	pick.ignoreFocusOut = false;
	setHideOnDidAccept(pick, false);
	pick.title = 'Jupyter Cell Tags features';
	pick.placeholder = 'Toggle features. Click outside or press Escape to close.';
	pick.matchOnDescription = true;
	pick.matchOnDetail = true;

	let updating = false;
	let applying = false;

	const applySelectionFromConfig = () => {
		updating = true;
		try {
			pick.items = FEATURE_SETTING_KEYS.map((key) => ({
				key,
				label: FEATURE_SETTING_LABELS[key],
				detail: `jupyter-cell-tags.features.${key}`,
			}));
			pick.selectedItems = pick.items.filter((item) => isFeatureSettingEnabled(item.key));
		} finally {
			updating = false;
		}
	};

	applySelectionFromConfig();

	const configSub = vscode.workspace.onDidChangeConfiguration((e) => {
		if (!e.affectsConfiguration('jupyter-cell-tags.features')) {
			return;
		}
		if (updating || applying) {
			return;
		}
		applySelectionFromConfig();
	});

	pick.onDidChangeSelection((selected) => {
		if (updating || applying) {
			return;
		}
		void applySelectionDiff(selected);
	});

	async function applySelectionDiff(selected: readonly FeaturePickItem[]): Promise<void> {
		if (applying) {
			return;
		}
		applying = true;
		try {
			const selectedKeys = new Set(selected.map((item) => item.key));
			for (const key of FEATURE_SETTING_KEYS) {
				const want = selectedKeys.has(key);
				if (want !== isFeatureSettingEnabled(key)) {
					await updateFeatureSetting(key, want);
				}
			}
		} catch (err) {
			log(`Failed to update feature settings from picker: ${err}`);
		} finally {
			applying = false;
		}
	}

	pick.onDidHide(() => {
		configSub.dispose();
		pick.dispose();
	});

	pick.show();
}

function setHideOnDidAccept(pick: vscode.QuickPick<FeaturePickItem>, value: boolean): void {
	(pick as vscode.QuickPick<FeaturePickItem> & { hideOnDidAccept?: boolean }).hideOnDidAccept = value;
}
