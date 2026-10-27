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
				cacheDir: path.join(launch.vscodeCache, 'chromedriver')
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
					'enable-proposed-api': 'phohale.pho-vscode-jupyter-cell-tags',
					'disable-extension': 'ms-toolsai.vscode-jupyter-cell-tags',
					'extensions-dir': launch.extensionsDir
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
		[
			class RewriteChromeArgs {
				beforeSession(_config: unknown, capabilities: WebdriverIO.Capabilities) {
					const chrome = capabilities['goog:chromeOptions'] as { args?: string[] } | undefined;
					if (!chrome?.args) {
						return;
					}
					// Default WDIO args include --disable-extensions, which blocks Jupyter.
					chrome.args = chrome.args.filter((arg) => !arg.startsWith('--disable-extensions'));
				}
			}
		]
	],
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
