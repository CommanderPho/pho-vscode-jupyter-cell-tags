import * as vscode from 'vscode';
import { Jupyter, Kernel } from '@vscode/jupyter-extension';
import { RssSample } from './types';

const StdOutMimeType = vscode.NotebookCellOutputItem.stdout('').mime;
const ErrorMimeType = vscode.NotebookCellOutputItem.error(new Error('')).mime;
const textDecoder = new TextDecoder();

/**
 * Stdlib-only Python probe: current RSS (prefer /proc VmRSS) and process peak (ru_maxrss).
 * Values are approximate; the probe itself allocates a little memory.
 */
export const RSS_PROBE_CODE = `
import json, resource, sys
def _rss():
    try:
        with open('/proc/self/status') as f:
            for line in f:
                if line.startswith('VmRSS:'):
                    return int(line.split()[1]) * 1024
    except Exception:
        pass
    v = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return int(v) if sys.platform == 'darwin' else int(v) * 1024
def _peak():
    v = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return int(v) if sys.platform == 'darwin' else int(v) * 1024
print(json.dumps({"rss": _rss(), "peak": _peak()}))
`.trim();

export type MemoryLogger = {
	appendLine(line: string): void;
};

async function getJupyterApi(): Promise<Jupyter | undefined> {
	const extension = vscode.extensions.getExtension<Jupyter>('ms-toolsai.jupyter');
	if (!extension) {
		return undefined;
	}
	if (!extension.isActive) {
		await extension.activate();
	}
	return extension.exports;
}

export async function getKernelForNotebook(notebookUri: vscode.Uri): Promise<Kernel | undefined> {
	const api = await getJupyterApi();
	if (!api) {
		return undefined;
	}
	const kernel = await api.kernels.getKernel(notebookUri);
	if (!kernel) {
		return undefined;
	}
	if (kernel.language && kernel.language.toLowerCase() !== 'python') {
		return undefined;
	}
	return kernel;
}

function parseProbeOutput(text: string): RssSample | undefined {
	const lines = text
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean);
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i];
		try {
			const parsed = JSON.parse(line) as { rss?: unknown; peak?: unknown };
			if (typeof parsed.rss === 'number' && typeof parsed.peak === 'number') {
				return { rssBytes: parsed.rss, peakBytes: parsed.peak };
			}
		} catch {
			// keep scanning
		}
	}
	return undefined;
}

/**
 * Run the RSS probe on the given kernel and return parsed bytes.
 * Returns undefined on failure (no throw for UI paths).
 */
export async function sampleKernelRss(
	kernel: Kernel,
	logger?: MemoryLogger,
	token?: vscode.CancellationToken
): Promise<RssSample | undefined> {
	const tokenSource = token ? undefined : new vscode.CancellationTokenSource();
	const effectiveToken = token ?? tokenSource!.token;
	let stdout = '';
	let stderr = '';
	try {
		for await (const output of kernel.executeCode(RSS_PROBE_CODE, effectiveToken)) {
			for (const item of output.items) {
				const text = textDecoder.decode(item.data);
				if (item.mime === ErrorMimeType) {
					stderr += text + '\n';
					logger?.appendLine(`[cellMemory] probe error: ${text}`);
				} else if (item.mime === StdOutMimeType || item.mime === 'text/plain') {
					stdout += text;
				} else {
					// Some kernels emit plain text under other mimes; still try to parse.
					stdout += text;
				}
			}
		}
		const sample = parseProbeOutput(stdout);
		if (!sample) {
			logger?.appendLine(`[cellMemory] failed to parse probe output: ${stdout.slice(0, 200)}`);
			if (stderr) {
				logger?.appendLine(`[cellMemory] stderr: ${stderr.slice(0, 200)}`);
			}
		}
		return sample;
	} catch (err) {
		logger?.appendLine(`[cellMemory] sampleKernelRss failed: ${err}`);
		return undefined;
	} finally {
		tokenSource?.dispose();
	}
}
