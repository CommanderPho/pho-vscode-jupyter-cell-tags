const path = require('path');
const os = require('os');

function remap(value, realRepo, junction) {
	const pairs = [
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
}

function rewrite(capabilities, label) {
	const chrome = capabilities['goog:chromeOptions'];
	if (!chrome) {
		console.log(`GUI smoke ${label}: no goog:chromeOptions`);
		return;
	}
	const realRepo = process.env.PHO_JCT_REAL_REPO || path.resolve(__dirname, '../../..');
	const junction = process.env.PHO_JCT_JUNCTION || path.join(os.tmpdir(), 'pho-jct', 'src');
	if (chrome.binary) {
		chrome.binary = remap(chrome.binary, realRepo, junction);
	}
	if (Array.isArray(chrome.args)) {
		chrome.args = chrome.args
			.filter((arg) => !String(arg).startsWith('--disable-extensions'))
			.map((arg) => remap(String(arg), realRepo, junction));
	}
	console.log(`GUI smoke ${label} binary:`, chrome.binary);
	console.log(`GUI smoke ${label} args:\n${(chrome.args || []).join('\n')}`);
}

class RewriteChromeArgs {
	beforeSession(_config, capabilities) {
		rewrite(capabilities, 'beforeSession');
	}

	before(capabilities) {
		rewrite(capabilities, 'before');
	}
}

module.exports = RewriteChromeArgs;
