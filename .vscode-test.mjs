import { defineConfig } from '@vscode/test-cli';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Prefer `npm test` (src/test/runTest.ts). vscode-test splits unquoted paths
// that contain spaces (this repo lives under "VSCode Extensions").
export default defineConfig({
	files: 'out/**/*.vscode.test.js',
	version: 'stable',
	workspaceFolder: join(__dirname, 'src', 'test', 'workspace'),
	installExtensions: ['ms-toolsai.jupyter'],
	mocha: {
		ui: 'tdd',
		color: true,
		timeout: 60000
	},
	launchArgs: [
		join(__dirname, 'src', 'test', 'workspace'),
		'--skip-welcome',
		'--skip-release-notes',
		'--disable-workspace-trust',
		'--enable-proposed-api=phohale.pho-vscode-jupyter-cell-tags',
		'--disable-extension=ms-toolsai.vscode-jupyter-cell-tags'
	]
});

