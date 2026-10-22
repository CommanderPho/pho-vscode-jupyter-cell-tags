import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import * as net from 'net';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { log } from '../util/logging';

const GLOBAL_STATE_KEY = 'externalKernel.durableServer';
const CONNECTED_STATE_KEY = 'externalKernel.connectedServers';
const MANAGED_SERVER_ID = 'durable-managed';
const LOG_TAIL_LINES = 40;

export interface DurableServerRecord {
	id: string;
	pid?: number;
	port: number;
	token: string;
	baseUrl: string;
	workspaceKey: string;
	logPath: string;
	startedAt: number;
	/** true when this extension spawned the process (Stop may kill it). */
	managed: boolean;
	label: string;
}

export type ServerHealth = 'unknown' | 'up' | 'down';

export class DurableServerManager implements vscode.Disposable {
	private readonly _onDidChangeServers = new vscode.EventEmitter<void>();
	readonly onDidChangeServers = this._onDidChangeServers.event;

	private managed: DurableServerRecord | undefined;
	private connected: DurableServerRecord[] = [];
	private lastHealth = new Map<string, ServerHealth>();
	/** Consecutive failed probes per server id (cleared on success). */
	private consecutiveProbeFailures = new Map<string, number>();
	private static readonly PROBE_FAILURES_BEFORE_CLEAR = 3;
	private starting: Promise<DurableServerRecord> | undefined;
	private output: vscode.OutputChannel;

	constructor(
		private readonly context: vscode.ExtensionContext,
		output?: vscode.OutputChannel
	) {
		this.output = output ?? vscode.window.createOutputChannel('Durable Jupyter');
	}

	get outputChannel(): vscode.OutputChannel {
		return this.output;
	}

	get managedServer(): DurableServerRecord | undefined {
		return this.managed;
	}

	getServers(): DurableServerRecord[] {
		const list: DurableServerRecord[] = [];
		if (this.managed) {
			list.push(this.managed);
		}
		for (const s of this.connected) {
			list.push(s);
		}
		return list;
	}

	getHealth(id: string): ServerHealth {
		return this.lastHealth.get(id) ?? 'unknown';
	}

	private append(line: string): void {
		this.output.appendLine(line);
		log(`[DurableJupyter] ${line}`);
	}

	private workspaceKey(): string {
		const folder = vscode.workspace.workspaceFolders?.[0];
		return folder?.uri.toString() ?? 'no-workspace';
	}

	private workspaceCwd(): string {
		const folder = vscode.workspace.workspaceFolders?.[0];
		return folder?.uri.fsPath ?? process.cwd();
	}

	/**
	 * Resolve a real Python executable for spawning Jupyter.
	 * Order: configured path (if it exists) → Python extension active interpreter → python/py on PATH.
	 * On Windows, Store alias stubs under WindowsApps are skipped.
	 */
	async resolvePythonExecutable(): Promise<string> {
		const candidates: { path: string; source: string }[] = [];

		const configured = vscode.workspace
			.getConfiguration('jupyter-cell-tags')
			.get<string>('jupyterEnhancements.kernel.pythonPath', '')
			?.trim();
		if (configured) {
			candidates.push({
				path: path.normalize(configured),
				source: 'jupyter-cell-tags.jupyterEnhancements.kernel.pythonPath',
			});
		}

		const fromPythonExt = await tryGetPythonExtensionInterpreter();
		if (fromPythonExt) {
			candidates.push({ path: fromPythonExt, source: 'Python extension active interpreter' });
		}

		for (const cmd of process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python']) {
			candidates.push({ path: cmd, source: 'PATH' });
		}

		const tried: string[] = [];
		for (const c of candidates) {
			if (tried.includes(c.path)) {
				continue;
			}
			tried.push(c.path);
			if (isWindowsAppsStub(c.path)) {
				this.append(`Skipping WindowsApps Python stub (${c.source}): ${c.path}`);
				continue;
			}
			const ok = await isRunnablePython(c.path);
			if (ok) {
				this.append(`Using Python from ${c.source}: ${c.path}`);
				return c.path;
			}
			this.append(`Skipping Python candidate (${c.source}): ${c.path}`);
		}

		const configuredHint = configured
			? ` Configured path does not exist: ${path.normalize(configured)}.`
			: '';
		throw new Error(
			`No usable Python found to start a durable Jupyter server.${configuredHint} Set jupyter-cell-tags.jupyterEnhancements.kernel.pythonPath to a valid python.exe (with jupyter installed), or select a Python interpreter in the Python extension.`
		);
	}

	/** Prefer pythonw.exe on Windows to avoid a flashing console window. */
	private resolveSpawnExecutable(python: string): string {
		if (process.platform !== 'win32') {
			return python;
		}
		const normalized = path.normalize(python);
		if (!/python\.exe$/i.test(normalized)) {
			return python;
		}
		const pythonw = normalized.replace(/python\.exe$/i, 'pythonw.exe');
		if (fs.existsSync(pythonw)) {
			this.append(`Using windowsless launcher: ${pythonw}`);
			return pythonw;
		}
		return python;
	}

	/**
	 * Ensure the interpreter can import jupyter_server or notebook before we spawn.
	 * Returns which entrypoint to prefer.
	 */
	private async preflightJupyter(
		python: string
	): Promise<'jupyter_server' | 'notebook'> {
		if (await canImportModule(python, 'jupyter_server')) {
			this.append(`Preflight OK: jupyter_server importable via ${python}`);
			return 'jupyter_server';
		}
		if (await canImportModule(python, 'notebook')) {
			this.append(`Preflight OK: notebook importable via ${python}`);
			return 'notebook';
		}
		throw new Error(
			`Python at ${python} has no Jupyter. Install jupyter_server in that env, or set jupyter-cell-tags.jupyterEnhancements.kernel.pythonPath to an env that already has it. Use “Durable Jupyter: Show Log” after a failed start for details.`
		);
	}

	private defaultPortSetting(): number {
		return vscode.workspace
			.getConfiguration('jupyter-cell-tags')
			.get<number>('externalKernel.defaultPort', 0) ?? 0;
	}

	async initialize(): Promise<void> {
		const stored = this.context.globalState.get<DurableServerRecord>(GLOBAL_STATE_KEY);
		const connectedStored =
			this.context.globalState.get<DurableServerRecord[]>(CONNECTED_STATE_KEY) ?? [];

		if (stored?.managed) {
			const ok = await this.probe(stored);
			if (ok) {
				this.managed = stored;
				this.lastHealth.set(stored.id, 'up');
				this.append(`Rehydrated managed server at ${stored.baseUrl} (pid ${stored.pid ?? '?'})`);
			} else {
				this.append(`Stale managed server record cleared (${stored.baseUrl})`);
				await this.context.globalState.update(GLOBAL_STATE_KEY, undefined);
			}
		}

		const aliveConnected: DurableServerRecord[] = [];
		for (const s of connectedStored) {
			const ok = await this.probe(s);
			if (ok) {
				aliveConnected.push(s);
				this.lastHealth.set(s.id, 'up');
			} else {
				this.append(`Dropped unreachable connected server ${s.baseUrl}`);
			}
		}
		this.connected = aliveConnected;
		await this.persistConnected();
		await this.syncContextKeys();
		this._onDidChangeServers.fire();
	}

	async startManaged(token?: vscode.CancellationToken): Promise<DurableServerRecord> {
		if (this.managed) {
			const ok = await this.probe(this.managed);
			if (ok) {
				this.lastHealth.set(this.managed.id, 'up');
				return this.managed;
			}
			this.append('Previous managed server is down; starting a new one.');
			this.managed = undefined;
			await this.context.globalState.update(GLOBAL_STATE_KEY, undefined);
		}

		if (this.starting) {
			return this.starting;
		}

		this.starting = this.doStartManaged(token).finally(() => {
			this.starting = undefined;
		});
		return this.starting;
	}

	private async doStartManaged(
		cancelToken?: vscode.CancellationToken
	): Promise<DurableServerRecord> {
		const python = await this.resolvePythonExecutable();
		const preferredEntrypoint = await this.preflightJupyter(python);
		const spawnExe = this.resolveSpawnExecutable(python);
		const token = crypto.randomBytes(24).toString('hex');
		const preferred = this.defaultPortSetting();
		const port = preferred > 0 ? preferred : await getFreePort();
		const baseUrl = `http://127.0.0.1:${port}`;
		const storageDir = this.context.globalStorageUri.fsPath;
		await fs.promises.mkdir(storageDir, { recursive: true });
		const logPath = path.join(storageDir, `durable-jupyter-${port}.log`);

		const serverAttempt: { label: string; moduleArgs: string[] } = {
			label: 'jupyter_server',
			moduleArgs: [
				'-m',
				'jupyter_server',
				'--no-browser',
				`--port=${port}`,
				'--port-retries=0',
				`--ServerApp.token=${token}`,
				'--ServerApp.open_browser=False',
			],
		};
		const notebookAttempt: { label: string; moduleArgs: string[] } = {
			label: 'jupyter notebook',
			moduleArgs: [
				'-m',
				'jupyter',
				'notebook',
				'--no-browser',
				`--port=${port}`,
				'--port-retries=0',
				`--ServerApp.token=${token}`,
				'--ServerApp.open_browser=False',
			],
		};
		const attempts =
			preferredEntrypoint === 'jupyter_server'
				? [serverAttempt, notebookAttempt]
				: [notebookAttempt, serverAttempt];

		let lastError: Error | undefined;
		for (const attempt of attempts) {
			if (cancelToken?.isCancellationRequested) {
				throw new vscode.CancellationError();
			}

			// Fresh log fd per attempt so inheritance stays valid on Windows
			const outFd = fs.openSync(logPath, 'a');
			this.append(`Starting ${attempt.label} via ${spawnExe} on port ${port}…`);
			this.append(`Log: ${logPath}`);

			let child: ChildProcess | undefined;
			try {
				child = spawn(spawnExe, attempt.moduleArgs, {
					cwd: this.workspaceCwd(),
					detached: true,
					windowsHide: true,
					shell: false,
					stdio: ['ignore', outFd, outFd],
					env: { ...process.env },
				});

				const exitState = { code: null as number | null, exited: false, spawnError: undefined as Error | undefined };
				child.once('error', (err) => {
					exitState.spawnError = err instanceof Error ? err : new Error(String(err));
				});
				child.once('exit', (code) => {
					exitState.exited = true;
					exitState.code = code;
				});

				const pid = child.pid;
				const record: DurableServerRecord = {
					id: MANAGED_SERVER_ID,
					pid,
					port,
					token,
					baseUrl,
					workspaceKey: this.workspaceKey(),
					logPath,
					startedAt: Date.now(),
					managed: true,
					label: `Durable :${port}`,
				};

				const ready = await waitForServerOrExit(
					record,
					exitState,
					60_000,
					cancelToken,
					(msg) => this.append(msg)
				);

				if (exitState.spawnError) {
					lastError = exitState.spawnError;
					this.append(`Spawn error (${attempt.label}): ${lastError.message}`);
					fs.closeSync(outFd);
					continue;
				}

				if (exitState.exited || !ready) {
					if (pid && !exitState.exited) {
						tryKill(pid);
					}
					const tail = readLogTail(logPath, LOG_TAIL_LINES);
					if (tail) {
						this.append('——— log tail ———');
						this.append(tail);
					}
					const reason = exitState.exited
						? `${attempt.label} exited early (code ${exitState.code ?? '?'})`
						: `Timed out waiting for ${attempt.label} at ${baseUrl}`;
					lastError = new Error(
						tail ? `${reason}.\n${tail}` : `${reason}. See Durable Jupyter output / Show Log.`
					);
					this.append(reason);
					fs.closeSync(outFd);
					continue;
				}

				// Server is up — detach from EH lifecycle, keep log handle in the child
				child.unref();
				try {
					fs.closeSync(outFd);
				} catch {
					// child still holds the inherited handle
				}

				this.managed = record;
				this.lastHealth.set(record.id, 'up');
				await this.context.globalState.update(GLOBAL_STATE_KEY, record);
				await this.syncContextKeys();
				this._onDidChangeServers.fire();
				this.append(`Managed durable server ready at ${baseUrl}?token=… (pid ${pid ?? '?'})`);
				return record;
			} catch (err) {
				lastError = err instanceof Error ? err : new Error(String(err));
				this.append(`Failed ${attempt.label}: ${lastError.message}`);
				if (child?.pid) {
					tryKill(child.pid);
				}
				try {
					fs.closeSync(outFd);
				} catch {
					// ignore
				}
			}
		}

		const tail = readLogTail(logPath, LOG_TAIL_LINES);
		if (tail) {
			this.append('——— final log tail ———');
			this.append(tail);
		}
		throw lastError ?? new Error('Failed to start durable Jupyter server');
	}

	async stopManaged(): Promise<void> {
		const record = this.managed;
		if (!record) {
			vscode.window.showInformationMessage('No managed durable Jupyter server is running.');
			return;
		}
		if (record.pid) {
			this.append(`Stopping managed server pid ${record.pid}…`);
			tryKill(record.pid);
		}
		this.managed = undefined;
		this.lastHealth.delete(record.id);
		await this.context.globalState.update(GLOBAL_STATE_KEY, undefined);
		await this.syncContextKeys();
		this._onDidChangeServers.fire();
		this.append('Managed durable server stopped.');
	}

	async connectExisting(baseUrlInput: string, tokenInput?: string): Promise<DurableServerRecord> {
		const parsed = parseServerUrl(baseUrlInput, tokenInput);
		const record: DurableServerRecord = {
			id: `connected-${parsed.port}-${crypto.randomBytes(4).toString('hex')}`,
			port: parsed.port,
			token: parsed.token,
			baseUrl: parsed.baseUrl,
			workspaceKey: this.workspaceKey(),
			logPath: '',
			startedAt: Date.now(),
			managed: false,
			label: `Connected :${parsed.port}`,
		};

		const ok = await this.probe(record);
		if (!ok) {
			throw new Error(`Could not reach Jupyter server at ${record.baseUrl}`);
		}

		// Replace any prior connected entry with same baseUrl
		this.connected = this.connected.filter((s) => s.baseUrl !== record.baseUrl);
		this.connected.push(record);
		this.lastHealth.set(record.id, 'up');
		await this.persistConnected();
		await this.syncContextKeys();
		this._onDidChangeServers.fire();
		this.append(`Connected to existing server ${record.baseUrl}`);
		return record;
	}

	async disconnect(id: string): Promise<void> {
		const before = this.connected.length;
		this.connected = this.connected.filter((s) => s.id !== id);
		this.lastHealth.delete(id);
		if (this.connected.length !== before) {
			await this.persistConnected();
			await this.syncContextKeys();
			this._onDidChangeServers.fire();
		}
	}

	async refreshHealth(): Promise<void> {
		let changed = false;
		for (const s of this.getServers()) {
			const ok = await this.probe(s);
			const next: ServerHealth = ok ? 'up' : 'down';
			const prev = this.lastHealth.get(s.id);
			this.lastHealth.set(s.id, next);
			if (prev !== next) {
				changed = true;
				this.append(`Health ${s.label}: ${next}`);
			}
			if (ok) {
				this.consecutiveProbeFailures.set(s.id, 0);
			} else {
				const failures = (this.consecutiveProbeFailures.get(s.id) ?? 0) + 1;
				this.consecutiveProbeFailures.set(s.id, failures);
				if (
					s.managed &&
					this.managed?.id === s.id &&
					failures >= DurableServerManager.PROBE_FAILURES_BEFORE_CLEAR
				) {
					this.append(
						`Managed server ${s.label} failed ${failures} consecutive health probes; clearing registration (process may still be alive)`
					);
					this.managed = undefined;
					this.consecutiveProbeFailures.delete(s.id);
					await this.context.globalState.update(GLOBAL_STATE_KEY, undefined);
					changed = true;
				}
			}
		}
		if (changed) {
			await this.syncContextKeys();
			this._onDidChangeServers.fire();
		}
	}

	async probe(record: Pick<DurableServerRecord, 'baseUrl' | 'token'>): Promise<boolean> {
		return probeApiStatus(record.baseUrl, record.token);
	}

	private async persistConnected(): Promise<void> {
		await this.context.globalState.update(CONNECTED_STATE_KEY, this.connected);
	}

	async syncContextKeys(): Promise<void> {
		const hasManaged = !!this.managed;
		const hasAny = this.getServers().length > 0;
		await vscode.commands.executeCommand(
			'setContext',
			'jupyter-cell-tags.externalKernel.managed',
			hasManaged
		);
		await vscode.commands.executeCommand(
			'setContext',
			'jupyter-cell-tags.externalKernel.running',
			hasAny
		);
	}

	dispose(): void {
		// Intentionally do not kill the managed process — it must outlive EH.
		this._onDidChangeServers.dispose();
	}
}

function processExists(pid: number): boolean {
	try {
		// Signal 0 tests existence without killing (works on Windows in modern Node).
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function tryKill(pid: number): void {
	try {
		if (!processExists(pid)) {
			return;
		}
		if (process.platform === 'win32') {
			spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
				detached: true,
				stdio: 'ignore',
				windowsHide: true,
			}).unref();
		} else {
			process.kill(pid, 'SIGTERM');
		}
	} catch {
		// ignore
	}
}

export function parseServerUrl(
	input: string,
	tokenOverride?: string
): { baseUrl: string; token: string; port: number } {
	const trimmed = input.trim();
	let url: URL;
	try {
		url = new URL(trimmed.includes('://') ? trimmed : `http://${trimmed}`);
	} catch {
		throw new Error(`Invalid server URL: ${input}`);
	}
	const token = (tokenOverride?.trim() || url.searchParams.get('token') || '').trim();
	url.search = '';
	url.hash = '';
	// Normalize path: Jupyter base is usually origin + optional prefix without trailing slash issues
	let baseUrl = url.origin + (url.pathname === '/' ? '' : url.pathname.replace(/\/$/, ''));
	const port = url.port
		? Number(url.port)
		: url.protocol === 'https:'
			? 443
			: 80;
	return { baseUrl, token, port };
}

function getFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.unref();
		server.on('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const addr = server.address();
			if (!addr || typeof addr === 'string') {
				server.close();
				reject(new Error('Could not allocate a free port'));
				return;
			}
			const { port } = addr;
			server.close((err) => (err ? reject(err) : resolve(port)));
		});
	});
}

export function probeApiStatus(baseUrl: string, token: string): Promise<boolean> {
	return new Promise((resolve) => {
		try {
			const url = new URL('/api/status', baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
			if (token) {
				url.searchParams.set('token', token);
			}
			const req = http.get(
				url,
				{
					timeout: 2500,
					headers: token ? { Authorization: `token ${token}` } : undefined,
				},
				(res) => {
					res.resume();
					resolve(!!res.statusCode && res.statusCode >= 200 && res.statusCode < 300);
				}
			);
			req.on('error', () => resolve(false));
			req.on('timeout', () => {
				req.destroy();
				resolve(false);
			});
		} catch {
			resolve(false);
		}
	});
}

async function waitForServerOrExit(
	record: DurableServerRecord,
	exitState: { exited: boolean; code: number | null; spawnError?: Error },
	timeoutMs: number,
	cancelToken: vscode.CancellationToken | undefined,
	onProgress: (msg: string) => void
): Promise<boolean> {
	const start = Date.now();
	let attempt = 0;
	while (Date.now() - start < timeoutMs) {
		if (cancelToken?.isCancellationRequested) {
			return false;
		}
		if (exitState.spawnError || exitState.exited) {
			return false;
		}
		attempt++;
		if (await probeApiStatus(record.baseUrl, record.token)) {
			return true;
		}
		if (attempt === 1 || attempt % 5 === 0) {
			onProgress(`Waiting for server… (${Math.round((Date.now() - start) / 1000)}s)`);
		}
		await delay(500);
	}
	return false;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isWindowsAppsStub(executable: string): boolean {
	if (process.platform !== 'win32') {
		return false;
	}
	const normalized = path.normalize(executable).toLowerCase();
	return normalized.includes(`${path.sep}windowsapps${path.sep}`) && /python(\.exe)?$/i.test(normalized);
}

function readLogTail(logPath: string, maxLines: number): string {
	try {
		if (!fs.existsSync(logPath)) {
			return '';
		}
		const text = fs.readFileSync(logPath, 'utf8');
		const lines = text.split(/\r?\n/);
		return lines.slice(-maxLines).join('\n').trim();
	} catch {
		return '';
	}
}

function canImportModule(python: string, moduleName: string): Promise<boolean> {
	return new Promise((resolve) => {
		const child = spawn(python, ['-c', `import ${moduleName}`], {
			windowsHide: true,
			shell: false,
			stdio: ['ignore', 'ignore', 'ignore'],
		});
		const timer = setTimeout(() => {
			try {
				child.kill();
			} catch {
				// ignore
			}
			resolve(false);
		}, 8000);
		child.on('error', () => {
			clearTimeout(timer);
			resolve(false);
		});
		child.on('exit', (code) => {
			clearTimeout(timer);
			resolve(code === 0);
		});
	});
}

async function tryGetPythonExtensionInterpreter(): Promise<string | undefined> {
	try {
		const ext = vscode.extensions.getExtension('ms-python.python');
		if (!ext) {
			return undefined;
		}
		if (!ext.isActive) {
			await ext.activate();
		}
		const api = ext.exports as {
			environments?: {
				getActiveEnvironmentPath?: (resource?: vscode.Uri) => { path?: string; id?: string };
				resolveEnvironment?: (
					path: unknown
				) => Thenable<{ executable?: { uri?: vscode.Uri } } | undefined>;
			};
			settings?: {
				getExecutionDetails?: (resource?: vscode.Uri) => { execCommand?: string[] };
			};
		};

		const resource =
			vscode.window.activeNotebookEditor?.notebook.uri ??
			vscode.workspace.workspaceFolders?.[0]?.uri;

		// Modern environments API
		const envPath = api.environments?.getActiveEnvironmentPath?.(resource);
		if (envPath && api.environments?.resolveEnvironment) {
			const resolved = await api.environments.resolveEnvironment(envPath);
			const exe = resolved?.executable?.uri?.fsPath;
			if (exe) {
				return exe;
			}
			if (envPath.path && path.isAbsolute(envPath.path)) {
				return envPath.path;
			}
		}

		// Older settings API
		const details = api.settings?.getExecutionDetails?.(resource);
		const cmd = details?.execCommand?.[0];
		if (cmd) {
			return cmd;
		}
	} catch {
		// ignore
	}
	return undefined;
}

function isRunnablePython(executable: string): Promise<boolean> {
	return new Promise((resolve) => {
		if (isWindowsAppsStub(executable)) {
			resolve(false);
			return;
		}
		// Absolute / relative paths must exist on disk
		if (executable.includes(path.sep) || executable.includes('/') || executable.includes(':')) {
			const normalized = path.normalize(executable);
			if (!fs.existsSync(normalized)) {
				resolve(false);
				return;
			}
		}

		const child = spawn(executable, ['-c', 'import sys; print(sys.executable)'], {
			windowsHide: true,
			shell: false,
			stdio: ['ignore', 'ignore', 'ignore'],
		});
		const timer = setTimeout(() => {
			try {
				child.kill();
			} catch {
				// ignore
			}
			resolve(false);
		}, 4000);
		child.on('error', () => {
			clearTimeout(timer);
			resolve(false);
		});
		child.on('exit', (code) => {
			clearTimeout(timer);
			resolve(code === 0);
		});
	});
}
