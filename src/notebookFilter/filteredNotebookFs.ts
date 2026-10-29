import * as vscode from 'vscode';
import { FILTERED_NOTEBOOK_SCHEME } from './filteredNotebookScheme';

type FileEntry = {
	data: Uint8Array;
	ctime: number;
	mtime: number;
};

function normalizePath(path: string): string {
	let next = path || '/';
	if (!next.startsWith('/')) {
		next = `/${next}`;
	}
	if (next.length > 1 && next.endsWith('/')) {
		next = next.slice(0, -1);
	}
	return next;
}

function parentPath(path: string): string {
	const normalized = normalizePath(path);
	const idx = normalized.lastIndexOf('/');
	if (idx <= 0) {
		return '/';
	}
	return normalized.slice(0, idx);
}

/**
 * In-memory readonly provider for synthetic `.ipynb` snapshots.
 * Use {@link setFile} from the extension; user writes are rejected.
 */
export class FilteredNotebookFileSystemProvider implements vscode.FileSystemProvider {
	private readonly files = new Map<string, FileEntry>();
	private readonly emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
	readonly onDidChangeFile = this.emitter.event;

	setFile(uri: vscode.Uri, data: Uint8Array): void {
		const key = normalizePath(uri.path);
		const now = Date.now();
		const existing = this.files.get(key);
		this.files.set(key, { data, ctime: existing?.ctime ?? now, mtime: now });
		this.emitter.fire([
			{
				type: existing ? vscode.FileChangeType.Changed : vscode.FileChangeType.Created,
				uri
			}
		]);
	}

	removeFile(uri: vscode.Uri): void {
		const key = normalizePath(uri.path);
		if (!this.files.has(key)) {
			return;
		}
		this.files.delete(key);
		this.emitter.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
	}

	watch(_uri: vscode.Uri, _options: { recursive: boolean; excludes: readonly string[] }): vscode.Disposable {
		return new vscode.Disposable(() => undefined);
	}

	stat(uri: vscode.Uri): vscode.FileStat {
		const key = normalizePath(uri.path);
		const file = this.files.get(key);
		if (file) {
			return {
				type: vscode.FileType.File,
				ctime: file.ctime,
				mtime: file.mtime,
				size: file.data.byteLength,
				permissions: vscode.FilePermission.Readonly
			};
		}
		if (this.isDirectory(key)) {
			return {
				type: vscode.FileType.Directory,
				ctime: 0,
				mtime: 0,
				size: 0,
				permissions: vscode.FilePermission.Readonly
			};
		}
		throw vscode.FileSystemError.FileNotFound(uri);
	}

	readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
		const dir = normalizePath(uri.path);
		if (!this.isDirectory(dir)) {
			throw vscode.FileSystemError.FileNotFound(uri);
		}
		const prefix = dir === '/' ? '/' : `${dir}/`;
		const children = new Map<string, vscode.FileType>();
		for (const key of this.files.keys()) {
			if (!key.startsWith(prefix)) {
				continue;
			}
			const rest = key.slice(prefix.length);
			const slash = rest.indexOf('/');
			if (slash === -1) {
				children.set(rest, vscode.FileType.File);
			} else {
				children.set(rest.slice(0, slash), vscode.FileType.Directory);
			}
		}
		return [...children.entries()];
	}

	readFile(uri: vscode.Uri): Uint8Array {
		const file = this.files.get(normalizePath(uri.path));
		if (!file) {
			throw vscode.FileSystemError.FileNotFound(uri);
		}
		return file.data;
	}

	createDirectory(_uri: vscode.Uri): void {
		throw vscode.FileSystemError.NoPermissions(`${FILTERED_NOTEBOOK_SCHEME} is read-only`);
	}

	writeFile(_uri: vscode.Uri, _content: Uint8Array, _options: { create: boolean; overwrite: boolean }): void {
		throw vscode.FileSystemError.NoPermissions(`${FILTERED_NOTEBOOK_SCHEME} is read-only`);
	}

	delete(_uri: vscode.Uri, _options: { recursive: boolean }): void {
		throw vscode.FileSystemError.NoPermissions(`${FILTERED_NOTEBOOK_SCHEME} is read-only`);
	}

	rename(_oldUri: vscode.Uri, _newUri: vscode.Uri, _options: { overwrite: boolean }): void {
		throw vscode.FileSystemError.NoPermissions(`${FILTERED_NOTEBOOK_SCHEME} is read-only`);
	}

	private isDirectory(path: string): boolean {
		const key = normalizePath(path);
		if (this.files.has(key)) {
			return false;
		}
		if (key === '/') {
			return true;
		}
		const prefix = `${key}/`;
		for (const filePath of this.files.keys()) {
			if (filePath.startsWith(prefix) || parentPath(filePath) === key) {
				return true;
			}
		}
		return false;
	}
}

