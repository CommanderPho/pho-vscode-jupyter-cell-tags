import * as path from 'path';
import { prepareGuiLaunch } from './launch';

const launch = prepareGuiLaunch();

const featureSettings = {
	'jupyter-cell-tags.features.jumpbacks': true,
	'jupyter-cell-tags.features.errorNavigation': true,
	'jupyter-cell-tags.features.outlineSync': true,
	'jupyter-cell-tags.features.customOutline': true,
	'jupyter-cell-tags.features.scrollbarDecorators': true,
	'jupyter-cell-tags.features.jupyterEnhancements': true,
	'jupyter-cell-tags.features.gitDiff': true,
	'jupyter-cell-tags.features.dependencyChain': true,
	'jupyter-cell-tags.features.notebookFilter': true,
	'jupyter-cell-tags.features.ringMeJupyter': true,
	'jupyter-cell-tags.features.durableKernel': true,
	'jupyter-cell-tags.features.cellHistory': true,
	'jupyter-cell-tags.features.cellExecutionTracking': true,
	'jupyter-cell-tags.features.cellNavigation': true,
	'jupyter-cell-tags.externalKernel.autoRegisterOnNotebookOpen': false,
	'jupyter-cell-tags.jupyterEnhancements.kernel.optimizeStartup': false,
	'jupyter-cell-tags.showDebugExecutionMessages': false,
	'jupyter-cell-tags.debugPrint': false
};

const proxyEntry = path
	.join(launch.extensionPath, 'node_modules', 'wdio-vscode-service', 'dist', 'proxy', 'cjs', 'entry.js')
	.replace(/\\/g, '/');

export const config: WebdriverIO.Config = {
	runner: 'local',
	specs: [path.join(__dirname, '*.gui.ts')],
	maxInstances: 1,
	capabilities: [
		{
			browserName: 'vscode',
			browserVersion: 'stable',
			'wdio:enforceWebDriverClassic': true,
			'wdio:chromedriverOptions': {
				cacheDir: launch.vscodeCache
			},
			'wdio:vscodeOptions': {
				extensionPath: launch.extensionPath,
				workspacePath: launch.workspacePath,
				storagePath: launch.storagePath,
				userSettings: featureSettings,
				verboseLogging: false,
				vscodeProxyOptions: {
					enable: true,
					connectionTimeout: 120000,
					commandTimeout: 30000
				},
				vscodeArgs: {
					skipWelcome: true,
					skipReleaseNotes: true,
					disableWorkspaceTrust: true,
					disableExtensions: false,
					'enable-proposed-api': 'phohale.pho-vscode-jupyter-cell-tags',
					'disable-extension': 'ms-toolsai.vscode-jupyter-cell-tags',
					'extensions-dir': launch.extensionsDir,
					extensionTestsPath: proxyEntry
				}
			}
		}
	],
	logLevel: 'warn',
	bail: 1,
	waitforTimeout: 15000,
	connectionRetryTimeout: 180000,
	connectionRetryCount: 2,
	services: [
		['vscode', { cachePath: launch.vscodeCache }],
		path.join(__dirname, 'rewriteChromeArgs.cjs')
	],
	beforeSession(_config, capabilities) {
		const chrome = (capabilities as WebdriverIO.Capabilities)['goog:chromeOptions'] as
			| { args?: string[]; binary?: string }
			| undefined;
		if (!chrome) {
			return;
		}
		const realRepo = launch.realRepo;
		const junction = launch.extensionPath;
		const remap = (value: string) => {
			const pairs: Array<[string, string]> = [
				[realRepo, junction],
				[realRepo.replace(/\\/g, '/'), junction.replace(/\\/g, '/')]
			];
			let out = value;
			for (const [from, to] of pairs) {
				const index = out.toLowerCase().indexOf(from.toLowerCase());
				if (index >= 0) {
					out = out.slice(0, index) + to + out.slice(index + from.length);
				}
			}
			return out;
		};
		if (chrome.binary) {
			chrome.binary = remap(chrome.binary);
		}
		if (chrome.args) {
			chrome.args = chrome.args
				.filter((arg) => !arg.startsWith('--disable-extensions'))
				.map(remap);
		}
	},
	framework: 'mocha',
	reporters: ['spec'],
	outputDir: launch.outputDir,
	mochaOpts: {
		ui: 'bdd',
		timeout: 60000
	},
	afterTest: async function (_test, _context, { passed }) {
		if (passed) {
			return;
		}
		const dest = path.join(launch.outputDir, `fail-${Date.now()}.png`);
		await browser.saveScreenshot(dest);
		console.error(`GUI smoke screenshot: ${dest}`);
	}
};
