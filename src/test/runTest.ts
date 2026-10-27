import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { downloadAndUnzipVSCode, runTests } from '@vscode/test-electron';

/**
 * @vscode/test-electron launches Code via cmd.exe and does not quote
 * `--extensionTestsPath=` / `--user-data-dir=`. This repo path contains a
 * space ("VSCode Extensions"), so every path we pass must live under a
 * no-space junction or cache directory.
 */
function workRoot(): string {
	return path.join(os.tmpdir(), 'pho-jct');
}

function ensureJunction(link: string, target: string): void {
	if (fs.existsSync(link)) {
		fs.rmdirSync(link);
	}
	fs.symlinkSync(target, link, 'junction');
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
	console.log(`Using local extension ${srcName}`);
	return true;
}

async function main(): Promise<void> {
	const realRepo = path.resolve(__dirname, '../..');
	const root = workRoot();
	fs.mkdirSync(root, { recursive: true });

	const repoLink = path.join(root, 'src');
	const vscodeCache = path.join(root, 'vscode');
	const extensionsDir = path.join(root, 'extensions');
	const userDataDir = path.join(root, 'user-data');
	fs.mkdirSync(extensionsDir, { recursive: true });
	fs.mkdirSync(userDataDir, { recursive: true });
	ensureJunction(repoLink, realRepo);

	copyLocalExtension('ms-toolsai.jupyter-', true, extensionsDir);
	copyLocalExtension('ms-toolsai.jupyter-renderers-', false, extensionsDir);

	const vscodeExecutablePath = await downloadAndUnzipVSCode({
		version: 'stable',
		cachePath: vscodeCache
	});

	await runTests({
		vscodeExecutablePath,
		extensionDevelopmentPath: repoLink,
		extensionTestsPath: path.join(repoLink, 'out', 'test', 'mochaRunner'),
		launchArgs: [
			path.join(repoLink, 'src', 'test', 'workspace'),
			`--extensions-dir=${extensionsDir}`,
			`--user-data-dir=${userDataDir}`,
			'--skip-welcome',
			'--skip-release-notes',
			'--disable-workspace-trust',
			'--enable-proposed-api=phohale.pho-vscode-jupyter-cell-tags',
			'--disable-extension=ms-toolsai.vscode-jupyter-cell-tags'
		]
	});
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
