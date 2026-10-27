import * as vscode from 'vscode';

type Restorer = () => void;

/**
 * Stubs VS Code window UI that would otherwise hang host tests (Quick Pick,
 * input boxes, file dialogs, and modal confirms).
 */
export class UiStubs {
	private restorers: Restorer[] = [];

	restore(): void {
		for (const restore of this.restorers.splice(0).reverse()) {
			restore();
		}
	}

	stubCreateQuickPick(label: string): void {
		const original = vscode.window.createQuickPick;
		vscode.window.createQuickPick = function createQuickPick<T extends vscode.QuickPickItem>(): vscode.QuickPick<T> {
			const accept = new vscode.EventEmitter<void>();
			const hide = new vscode.EventEmitter<void>();
			const changeValue = new vscode.EventEmitter<string>();
			const changeActive = new vscode.EventEmitter<readonly T[]>();
			const changeSelection = new vscode.EventEmitter<readonly T[]>();
			const triggerButton = new vscode.EventEmitter<vscode.QuickInputButton>();
			const triggerItemButton = new vscode.EventEmitter<vscode.QuickPickItemButtonEvent<T>>();
			const fake = {
				value: '',
				placeholder: undefined,
				title: undefined,
				prompt: undefined,
				step: undefined,
				totalSteps: undefined,
				enabled: true,
				busy: false,
				ignoreFocusOut: false,
				matchOnDescription: false,
				matchOnDetail: false,
				keepScrollPosition: false,
				canSelectMany: false,
				items: [],
				activeItems: [],
				selectedItems: [],
				buttons: [],
				onDidChangeValue: changeValue.event,
				onDidAccept: accept.event,
				onDidHide: hide.event,
				onDidChangeActive: changeActive.event,
				onDidChangeSelection: changeSelection.event,
				onDidTriggerButton: triggerButton.event,
				onDidTriggerItemButton: triggerItemButton.event,
				show: () => {
					const match =
						fake.items.find((item) => item.label === label || item.label.includes(label)) ??
						({ label } as T);
					fake.selectedItems = [match];
					fake.activeItems = [match];
					setTimeout(() => accept.fire(), 10);
				},
				hide: () => hide.fire(),
				dispose: () => {
					accept.dispose();
					hide.dispose();
					changeValue.dispose();
					changeActive.dispose();
					changeSelection.dispose();
					triggerButton.dispose();
					triggerItemButton.dispose();
				}
			} as vscode.QuickPick<T>;
			return fake;
		} as typeof vscode.window.createQuickPick;
		this.restorers.push(() => {
			vscode.window.createQuickPick = original;
		});
	}

	stubShowQuickPick(matcher: string | ((item: vscode.QuickPickItem) => boolean)): void {
		const original = vscode.window.showQuickPick;
		vscode.window.showQuickPick = (async (items: unknown) => {
			const resolved = await items;
			const list: vscode.QuickPickItem[] = Array.isArray(resolved) ? resolved : [];
			if (typeof matcher === 'function') {
				return list.find(matcher);
			}
			return (
				list.find(
					(item) => item.label === matcher || item.label.includes(matcher)
				) ?? list[0]
			);
		}) as typeof vscode.window.showQuickPick;
		this.restorers.push(() => {
			vscode.window.showQuickPick = original;
		});
	}

	stubInputBox(value: string): void {
		const original = vscode.window.showInputBox;
		vscode.window.showInputBox = (async () => value) as typeof vscode.window.showInputBox;
		this.restorers.push(() => {
			vscode.window.showInputBox = original;
		});
	}

	stubSaveDialog(uri: vscode.Uri): void {
		const original = vscode.window.showSaveDialog;
		vscode.window.showSaveDialog = (async () => uri) as typeof vscode.window.showSaveDialog;
		this.restorers.push(() => {
			vscode.window.showSaveDialog = original;
		});
	}

	stubOpenDialog(uri: vscode.Uri): void {
		const original = vscode.window.showOpenDialog;
		vscode.window.showOpenDialog = (async () => [uri]) as typeof vscode.window.showOpenDialog;
		this.restorers.push(() => {
			vscode.window.showOpenDialog = original;
		});
	}

	stubWarningConfirm(button: string): void {
		const original = vscode.window.showWarningMessage;
		vscode.window.showWarningMessage = (async (_message: string, ...args: unknown[]) => {
			const buttons = args.filter((arg): arg is string => typeof arg === 'string');
			return buttons.find((item) => item === button) ?? buttons[0];
		}) as typeof vscode.window.showWarningMessage;
		this.restorers.push(() => {
			vscode.window.showWarningMessage = original;
		});
	}
}
