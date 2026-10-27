/**
 * Launch the local WDIO CLI. Chrome args with spaces are rewritten onto the
 * %TEMP%/pho-jct junction in wdio.conf.ts.
 */
const { spawn, execSync } = require('child_process');
const path = require('path');

try {
	execSync(
		'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq \'Code.exe\' -and $_.ExecutablePath -like \'*pho-jct*wdio-vscode*\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"',
		{ stdio: 'ignore' }
	);
} catch {
	/* no leftover test VS Code */
}

const repo = path.resolve(__dirname, '../../..');
const wdioCli = path.join(repo, 'node_modules', '@wdio', 'cli', 'bin', 'wdio.js');

const child = spawn(process.execPath, [wdioCli, 'run', path.join(repo, 'src', 'test', 'gui', 'wdio.conf.ts')], {
	cwd: repo,
	stdio: 'inherit'
});
child.on('exit', (code) => process.exit(code ?? 1));
