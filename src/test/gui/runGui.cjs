/**
 * WDIO's Chromium wrapper and this repo's path ("VSCode Extensions") do not mix.
 * Run from a no-space junction under %TEMP%/pho-jct, same as the host tests.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repo = path.resolve(__dirname, '../../..');
const junction = path.join(os.tmpdir(), 'pho-jct', 'src');
const wdioCli = path.join(junction, 'node_modules', '@wdio', 'cli', 'bin', 'wdio.js');

function ensureJunction(link, target) {
	fs.mkdirSync(path.dirname(link), { recursive: true });
	try {
		fs.lstatSync(link);
		fs.rmdirSync(link);
	} catch {
		/* no existing link */
	}
	fs.symlinkSync(target, link, 'junction');
}

ensureJunction(junction, repo);
console.log(`GUI smoke: running from ${junction}`);

const child = spawn(process.execPath, [wdioCli, 'run', 'src/test/gui/wdio.conf.ts'], {
	cwd: junction,
	stdio: 'inherit'
});
child.on('exit', (code) => process.exit(code ?? 1));
