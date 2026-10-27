#!/usr/bin/env bash
# Idempotent Cloud Agent install script. Runs from the project root during Builds.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT}"

echo "==> npm ci"
npm ci

echo "==> compile"
npm run compile

echo "==> warm VS Code cache"
node <<'EOF'
const { downloadAndUnzipVSCode } = require('@vscode/test-electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const cachePath = path.join(os.tmpdir(), 'pho-jct', 'vscode');
fs.mkdirSync(cachePath, { recursive: true });

downloadAndUnzipVSCode({ version: 'stable', cachePath })
	.then((executable) => {
		console.log('VS Code cached at', executable);
	})
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
EOF

echo "==> install Jupyter extensions into ~/.vscode/extensions"
node <<'EOF'
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

async function installOpenVsx(publisher, name) {
	const destRoot = path.join(os.homedir(), '.vscode', 'extensions');
	fs.mkdirSync(destRoot, { recursive: true });

	const metaRes = await fetch(`https://open-vsx.org/api/${publisher}/${name}/latest`);
	if (!metaRes.ok) {
		throw new Error(`Open VSX ${publisher}.${name}: HTTP ${metaRes.status}`);
	}
	const meta = await metaRes.json();
	const version = meta.version;
	const url = meta.files && meta.files.download;
	if (!version || !url) {
		throw new Error(`Open VSX ${publisher}.${name}: missing version or download URL`);
	}

	const dest = path.join(destRoot, `${publisher}.${name}-${version}`);
	if (fs.existsSync(dest)) {
		console.log(`already installed ${path.basename(dest)}`);
		return;
	}

	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vsix-'));
	try {
		const vsixPath = path.join(tmp, 'ext.vsix');
		const unpacked = path.join(tmp, 'unpacked');
		const vsixRes = await fetch(url);
		if (!vsixRes.ok) {
			throw new Error(`download ${url}: HTTP ${vsixRes.status}`);
		}
		fs.writeFileSync(vsixPath, Buffer.from(await vsixRes.arrayBuffer()));
		execFileSync('unzip', ['-q', vsixPath, '-d', unpacked]);
		const extDir = path.join(unpacked, 'extension');
		if (!fs.existsSync(extDir)) {
			throw new Error(`${publisher}.${name} vsix has no extension/ directory`);
		}
		fs.cpSync(extDir, dest, { recursive: true });
		console.log(`installed ${path.basename(dest)}`);
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true });
	}
}

(async () => {
	await installOpenVsx('ms-toolsai', 'jupyter');
	await installOpenVsx('ms-toolsai', 'jupyter-renderers');
})().catch((err) => {
	console.error(err);
	process.exit(1);
});
EOF

echo "==> install complete"
