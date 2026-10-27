import * as path from 'path';
import * as fs from 'fs';
import Mocha = require('mocha');

function collect(dir: string, acc: string[]): void {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			collect(full, acc);
		} else if (entry.name.endsWith('.vscode.test.js')) {
			acc.push(full);
		}
	}
}

export async function run(): Promise<void> {
	const mocha = new Mocha({
		ui: 'tdd',
		color: true,
		timeout: 60000,
		reporter: 'spec'
	});
	const files: string[] = [];
	collect(path.resolve(__dirname, '..'), files);
	for (const file of files) {
		mocha.addFile(file);
	}
	await mocha.loadFilesAsync();
	return new Promise((resolve, reject) => {
		const runner = mocha.run((failures) => {
			if (failures > 0) {
				reject(new Error(`${failures} tests failed.`));
			} else {
				resolve();
			}
		});
		runner.on('fail', (test, err) => {
			console.error(`FAIL: ${test.fullTitle()}\n${err.stack || err}`);
		});
	});
}
