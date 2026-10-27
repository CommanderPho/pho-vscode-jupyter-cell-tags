import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * WDIO / VS Code launch args must not contain spaces. This repo lives under
 * "VSCode Extensions", so we junction it under %TEMP%/pho-jct (same as host tests).
 */
export function workRoot(): string {
	return path.join(os.tmpdir(), 'pho-jct');
}

export interface GuiLaunchPaths {
	realRepo: string;
	extensionPath: string;
	workspacePath: string;
	storagePath: string;
	extensionsDir: string;
	vscodeCache: string;
	outputDir: string;
	fixturePath: string;
}

function ensureJunction(link: string, target: string): void {
	try {
		fs.lstatSync(link);
		return;
	} catch {
		fs.symlinkSync(target, link, 'junction');
	}
}

function copyLocalExtension(idPrefix: string, versionDigitNext: boolean, extensionsDir: string): boolean {
	const homeExt = path.join(os.homedir(), '.vscode', 'extensions');
	if (!fs.existsSync(homeExt)) {
		return false;
	}
	const matches = fs
		.readdirSync(homeExt)
		.filter((name) => {
			if (!name.startsWith(idPrefix) || !fs.statSync(path.join(homeExt, name)).isDirectory()) {
				return false;
			}
			if (versionDigitNext) {
				return new RegExp(`^${idPrefix.replace(/\./g, '\\.')}\\d`).test(name);
			}
			return true;
		})
		.sort();
	if (matches.length === 0) {
		return false;
	}
	const srcName = matches[matches.length - 1];
	const dest = path.join(extensionsDir, srcName);
	if (!fs.existsSync(dest)) {
		fs.cpSync(path.join(homeExt, srcName), dest, { recursive: true });
	}
	console.log(`GUI smoke: using local extension ${srcName}`);
	return true;
}

export function prepareGuiLaunch(): GuiLaunchPaths {
	const realRepo = path.resolve(__dirname, '../../..');
	const root = workRoot();
	fs.mkdirSync(root, { recursive: true });

	const repoLink = path.join(root, 'src');
	ensureJunction(repoLink, realRepo);

	const extensionsDir = path.join(root, 'extensions');
	const storagePath = path.join(root, 'wdio-storage');
	const vscodeCache = path.join(root, 'wdio-vscode');
	const outputDir = path.join(root, 'wdio-trace');
	fs.mkdirSync(extensionsDir, { recursive: true });
	fs.mkdirSync(storagePath, { recursive: true });
	fs.mkdirSync(vscodeCache, { recursive: true });
	fs.mkdirSync(outputDir, { recursive: true });

	copyLocalExtension('ms-toolsai.jupyter-', true, extensionsDir);
	copyLocalExtension('ms-toolsai.jupyter-renderers-', false, extensionsDir);
	const storageExtensions = path.join(storagePath, 'extensions');
	fs.mkdirSync(storageExtensions, { recursive: true });
	copyLocalExtension('ms-toolsai.jupyter-', true, storageExtensions);
	copyLocalExtension('ms-toolsai.jupyter-renderers-', false, storageExtensions);

	const fixtureDir = path.join(root, 'fixtures');
	fs.mkdirSync(fixtureDir, { recursive: true });
	const fixturePath = path.join(fixtureDir, 'command-matrix.ipynb');
	fs.copyFileSync(path.join(realRepo, 'src', 'test', 'fixtures', 'command-matrix.ipynb'), fixturePath);

	return {
		realRepo,
		extensionPath: repoLink,
		workspacePath: path.join(repoLink, 'src', 'test', 'workspace'),
		storagePath,
		extensionsDir,
		vscodeCache,
		outputDir,
		fixturePath
	};
}
