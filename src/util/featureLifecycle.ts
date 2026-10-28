import * as vscode from 'vscode';
import { FeatureKey, isFeatureEnabled } from './featureFlags';
import { log } from './logging';

export type FeatureActivator = {
	activate: (context: vscode.ExtensionContext) => unknown;
	onDispose?: () => unknown;
};

export type FeatureActivators = Partial<Record<FeatureKey, FeatureActivator>>;

/**
 * Child ExtensionContext whose `subscriptions` is a private array.
 * All other properties/methods inherit from the parent so existing
 * `activate*` functions can keep calling `context.subscriptions.push(...)`.
 *
 * Implemented with `Object.create` rather than a Proxy: `subscriptions` on
 * the real ExtensionContext is a non-configurable readonly data property,
 * so a Proxy that returns a different array violates the invariant and throws.
 */
export function createFeatureContext(parent: vscode.ExtensionContext): vscode.ExtensionContext {
	const subscriptions: { dispose(): any }[] = [];
	const child = Object.create(parent) as vscode.ExtensionContext;
	Object.defineProperty(child, 'subscriptions', {
		value: subscriptions,
		writable: false,
		enumerable: true,
		configurable: true,
	});
	return child;
}

async function disposeSubscriptions(subscriptions: { dispose(): any }[]): Promise<void> {
	const pending: Promise<unknown>[] = [];
	const items = subscriptions.splice(0).reverse();
	for (const item of items) {
		try {
			const result = item.dispose();
			if (result && typeof (result as Promise<unknown>).then === 'function') {
				pending.push(result);
			}
		} catch (err) {
			log(`Error disposing feature subscription: ${err}`);
		}
	}
	await Promise.all(pending);
}

/**
 * Enables/disables optional features on the live Extension Host by disposing
 * a child context and re-calling the existing activate function. Toggles are
 * serialized so rapid Settings flips cannot double-register a command id.
 */
export class FeatureController implements vscode.Disposable {
	private readonly live = new Set<FeatureKey>();
	private readonly children = new Map<FeatureKey, vscode.ExtensionContext>();
	private queue: Promise<void> = Promise.resolve();
	private disposed = false;

	constructor(
		private readonly parent: vscode.ExtensionContext,
		private readonly activators: FeatureActivators,
		private readonly isEnabled: (feature: FeatureKey) => boolean = isFeatureEnabled
	) {}

	whenIdle(): Promise<void> {
		return this.queue;
	}

	isLive(feature: FeatureKey): boolean {
		return this.live.has(feature);
	}

	start(): Promise<void> {
		return this.enqueue(() => this.syncAll());
	}

	handleConfigurationChange(e: vscode.ConfigurationChangeEvent): Promise<void> {
		if (!e.affectsConfiguration('jupyter-cell-tags.features')) {
			return this.queue;
		}
		return this.enqueue(() => this.syncAll(e));
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		void this.enqueue(async () => {
			for (const feature of [...this.live]) {
				await this.disable(feature);
			}
		});
	}

	private enqueue(task: () => Promise<void>): Promise<void> {
		const run = this.queue.then(task, task);
		this.queue = run.then(
			() => undefined,
			() => undefined
		);
		return run;
	}

	private activatorKeys(): FeatureKey[] {
		return (Object.keys(this.activators) as FeatureKey[]).filter(
			(key) => this.activators[key] !== undefined
		);
	}

	private async syncAll(e?: vscode.ConfigurationChangeEvent): Promise<void> {
		for (const feature of this.activatorKeys()) {
			if (e && !e.affectsConfiguration(`jupyter-cell-tags.features.${feature}`)) {
				continue;
			}
			const want = this.isEnabled(feature);
			const live = this.live.has(feature);
			if (want && !live) {
				await this.enable(feature);
			} else if (!want && live) {
				await this.disable(feature);
			}
		}
	}

	private async enable(feature: FeatureKey): Promise<void> {
		if (this.live.has(feature) || this.disposed) {
			return;
		}
		const activator = this.activators[feature];
		if (!activator) {
			return;
		}
		const child = createFeatureContext(this.parent);
		this.children.set(feature, child);
		try {
			await activator.activate(child);
			this.live.add(feature);
			log(`Feature ${feature} enabled`);
		} catch (err) {
			this.children.delete(feature);
			await disposeSubscriptions(child.subscriptions);
			log(`Feature ${feature} failed to activate: ${err}`);
		}
	}

	private async disable(feature: FeatureKey): Promise<void> {
		if (!this.live.has(feature)) {
			return;
		}
		const child = this.children.get(feature);
		this.children.delete(feature);
		this.live.delete(feature);
		if (child) {
			await disposeSubscriptions(child.subscriptions);
		}
		try {
			await this.activators[feature]?.onDispose?.();
		} catch (err) {
			log(`Feature ${feature} onDispose failed: ${err}`);
		}
		log(`Feature ${feature} disabled`);
	}
}

let controller: FeatureController | undefined;

/**
 * Activate currently-enabled optional features and re-sync them when
 * `jupyter-cell-tags.features.*` changes. No reload prompt.
 * Awaits the initial enable pass so `activate()` does not return before
 * optional commands are registered.
 */
export async function registerFeatureHotToggle(
	context: vscode.ExtensionContext,
	activators: FeatureActivators
): Promise<FeatureController> {
	controller = new FeatureController(context, activators);
	context.subscriptions.push(controller);
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			void controller?.handleConfigurationChange(e);
		})
	);
	await controller.start();
	return controller;
}

/** Resolves after in-flight feature enable/disable work finishes. */
export function whenFeatureTogglesIdle(): Promise<void> {
	return controller?.whenIdle() ?? Promise.resolve();
}

export function getFeatureController(): FeatureController | undefined {
	return controller;
}
