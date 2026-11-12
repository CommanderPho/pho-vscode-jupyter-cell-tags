import * as util from 'util';
import type { LiveConsoleApi } from './consoleApi';
import type * as ts from 'typescript';

/** Lazy so merely loading this module does not require the `typescript` package. */
function loadTypeScript(): typeof ts {
	return require('typescript') as typeof ts;
}

export type EvalLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export type EvalLogLine = {
	level: EvalLogLevel;
	text: string;
};

export type EvalResult = {
	ok: boolean;
	valueText?: string;
	errorText?: string;
	logs: EvalLogLine[];
	durationMs: number;
};

export type EvalBindings = {
	/** Full `vscode` module namespace injected into snippets. */
	vscode: typeof import('vscode');
	api: LiveConsoleApi;
};

const STATEMENT_START =
	/^(const|let|var|if|for|while|do|switch|try|throw|function|class|import|export|type|interface|enum|declare|async\s+function|return)\b/;

/**
 * If the snippet has no explicit return and looks like a single expression,
 * wrap it so the REPL shows the value.
 */
export function coerceReturn(source: string): string {
	const trimmed = source.trim();
	if (!trimmed) {
		return 'return undefined;';
	}
	if (/\breturn\b/.test(trimmed)) {
		return trimmed;
	}
	if (!trimmed.includes('\n') && !STATEMENT_START.test(trimmed)) {
		return `return (${trimmed});`;
	}
	return trimmed;
}

export function transpileTypeScript(source: string): string {
	const tsApi = loadTypeScript();
	const prepared = coerceReturn(source);
	const result = tsApi.transpileModule(prepared, {
		compilerOptions: {
			module: tsApi.ModuleKind.None,
			target: tsApi.ScriptTarget.ES2022,
			strict: false,
			esModuleInterop: true,
			skipLibCheck: true,
		},
		reportDiagnostics: true,
		fileName: 'live-console.ts',
	});

	const errors = (result.diagnostics ?? []).filter(
		(d) => d.category === tsApi.DiagnosticCategory.Error
	);
	if (errors.length > 0) {
		const message = errors
			.map((d) => {
				const text = tsApi.flattenDiagnosticMessageText(d.messageText, '\n');
				if (d.file && d.start !== undefined) {
					const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
					return `TS${d.code} (${line + 1},${character + 1}): ${text}`;
				}
				return `TS${d.code}: ${text}`;
			})
			.join('\n');
		throw new Error(message);
	}

	return result.outputText;
}

function formatValue(value: unknown): string {
	if (value === undefined) {
		return 'undefined';
	}
	if (typeof value === 'string') {
		return value;
	}
	try {
		return util.inspect(value, {
			depth: 4,
			colors: false,
			maxArrayLength: 50,
			breakLength: 80,
		});
	} catch {
		try {
			return String(value);
		} catch {
			return '[unprintable]';
		}
	}
}

function formatConsoleArgs(args: unknown[]): string {
	return args.map((arg) => formatValue(arg)).join(' ');
}

type AsyncFunctionConstructor = new (
	...args: string[]
) => (...args: unknown[]) => Promise<unknown>;

function getAsyncFunctionConstructor(): AsyncFunctionConstructor {
	return Object.getPrototypeOf(async function () {
		/* AsyncFunction probe */
	}).constructor as AsyncFunctionConstructor;
}

/**
 * Transpile and evaluate TypeScript in the extension host with curated bindings.
 */
export async function evaluateTypeScript(
	source: string,
	bindings: EvalBindings
): Promise<EvalResult> {
	const logs: EvalLogLine[] = [];
	const started = Date.now();

	const bridgedConsole: Pick<Console, EvalLogLevel> = {
		log: (...args: unknown[]) => {
			logs.push({ level: 'log', text: formatConsoleArgs(args) });
		},
		info: (...args: unknown[]) => {
			logs.push({ level: 'info', text: formatConsoleArgs(args) });
		},
		warn: (...args: unknown[]) => {
			logs.push({ level: 'warn', text: formatConsoleArgs(args) });
		},
		error: (...args: unknown[]) => {
			logs.push({ level: 'error', text: formatConsoleArgs(args) });
		},
		debug: (...args: unknown[]) => {
			logs.push({ level: 'debug', text: formatConsoleArgs(args) });
		},
	};

	try {
		const js = transpileTypeScript(source);
		const AsyncFunction = getAsyncFunctionConstructor();
		const runner = new AsyncFunction(
			'vscode',
			'api',
			'console',
			`"use strict";\n${js}\n//# sourceURL=jupyter-cell-tags-live-console.js`
		);
		const value = await runner(bindings.vscode, bindings.api, bridgedConsole);
		return {
			ok: true,
			valueText: formatValue(value),
			logs,
			durationMs: Date.now() - started,
		};
	} catch (err) {
		const errorText =
			err instanceof Error
				? err.stack
					? `${err.name}: ${err.message}\n${err.stack}`
					: `${err.name}: ${err.message}`
				: String(err);
		return {
			ok: false,
			errorText,
			logs,
			durationMs: Date.now() - started,
		};
	}
}
