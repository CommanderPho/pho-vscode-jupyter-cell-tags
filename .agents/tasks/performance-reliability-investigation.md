# Performance & Reliability Investigation Report
**vscode-jupyter-cell-tags**  
**Date:** 2025-07-11  
**Scope:** Full static analysis of `src/` — no code was modified.

---

## Executive Summary

The codebase is generally well-structured and shows good defensive programming in newer code (debouncing, optional-chaining, disposable cleanup). However, five recurring patterns introduce measurable overhead or hard-to-debug reliability gaps:

1. **`useCustomMetadata()` calls `vscode.extensions.getExtension()` on every single tag read/write** — a repeated extension registry scan with no caching.
2. **`updateContext()` in extension.ts fires `JumpbackDataSource.loadFromNotebook()` synchronously on every text-selection change**, loading and parsing notebook metadata just to check a boolean flag.
3. **`addTagsToMultipleCells()` applies one `WorkspaceEdit` per cell**, issuing N sequential round-trips instead of a single batched edit.
4. **`updateCellRunGroupMetadata()` in `cellMetadataHelpers.ts` fires `applyEdit()` without `await`**, silently dropping errors.
5. **`TagTreeItem` constructor calls `TagPropertiesManager.getTagProperties()` (which clones notebook metadata) for every tag node rendered**, so a notebook with 50 tags makes 50 separate metadata deep-clones per tree refresh.

Additional medium- and low-severity issues follow below.

---

## Findings by Category

---

### 1. Performance Bottlenecks

---

#### PF-1 — HIGH: `useCustomMetadata()` re-queries the extension registry on every tag access

**File:** `src/util/notebookMetadata.ts` lines 7–12  
**File:** `src/helper.ts` lines 27–29, 33

```ts
export function useCustomMetadata() {
    if (vscode.extensions.getExtension('vscode.ipynb')?.exports.dropCustomMetadata) {
        return false;
    }
    return true;
}
```

`getCellTags()` and `updateCellTags()` both call `useCustomMetadata()` inline. `getCellTags()` is on every hot path: tree-view refresh, status-bar update, scrollbar decorator update, `executeGroup`, `contextKeys.updateContextKeys`, `addCellTag`, etc. VS Code's `getExtension()` is synchronous but still traverses an internal extension map each time.

**Impact:** In a 200-cell notebook with 10 tags each, a single tree refresh calls `getCellTags()` 200 times → 200 `getExtension()` calls. With the scrollbar decorator manager and the status-bar also listening, a single notebook change event can easily produce 600+ redundant extension registry lookups.

**Recommendation:** Cache the result once at activation time (the `dropCustomMetadata` flag does not change within a session):

```ts
let _useCustomMetadata: boolean | undefined;
export function useCustomMetadata(): boolean {
    if (_useCustomMetadata === undefined) {
        _useCustomMetadata = !vscode.extensions.getExtension('vscode.ipynb')?.exports.dropCustomMetadata;
    }
    return _useCustomMetadata;
}
```

---

#### PF-2 — HIGH: `TagTreeItem` constructor fetches-and-clones notebook metadata once per tag per render

**File:** `src/noteAllTags/TagTreeItem.ts` lines 17, 63–70  
**File:** `src/tagProperties/tagPropertiesManager.ts` `getTagProperties` → `getAllTagProperties`

`TagTreeItem` is constructed inside `getTreeItem()`, which VS Code calls for every visible node. `getTagProperties()` calls `getAllTagProperties()`, which deep-clones the entire `tagProperties` map from notebook metadata every time:

```ts
public static getAllTagProperties(notebook: vscode.NotebookDocument): Record<string, TagProperties> {
    const props = metadata[this.METADATA_KEY] || {};
    const clone: Record<string, TagProperties> = {};
    for (const key of Object.keys(props)) {
        clone[key] = { ...props[key] };
    }
    return clone;
}
```

For N tags, VS Code calls `getTreeItem` N times → N calls to `getAllTagProperties` → N full clones of the properties map.

**Recommendation:** `getTreeItem` should receive a pre-fetched properties map, or `TagTreeItem` should accept pre-resolved `TagProperties` as a constructor argument. The single `getAllTagProperties()` call should be made once in `updateTags()` / `getChildren()` and passed down.

---

#### PF-3 — MEDIUM: `addTagsToMultipleCells()` issues N sequential `WorkspaceEdit` calls

**File:** `src/cellTags/cellTags.ts` lines 72–75

```ts
export async function addTagsToMultipleCells(cells: vscode.NotebookCell[], tags: string[]) {
    for (const cell of cells) {
        await addCellTag(cell, tags);  // each call → 1 WorkspaceEdit applied immediately
    }
}
```

Each `addCellTag` call constructs and applies a separate `WorkspaceEdit`. For a multi-cell selection with 30 tagged cells, this causes 30 sequential notebook metadata round-trips, 30 `onDidChangeNotebookDocument` events, 30 tree-view debounce resets (each resetting the 250 ms timer), and potentially 30 `createdAt` timestamp writes.

**Recommendation:** Collect all `NotebookEdit` objects with `defer_apply: true`, combine them into a single `WorkspaceEdit`, and apply once. `updateCellTags(..., defer_apply: true)` already returns the edit object; the caller just needs to batch them.

---

#### PF-4 — MEDIUM: `getAllTagsFromActiveNotebook()` re-scans all cells every call with no caching

**File:** `src/util/notebookSelection.ts` lines 138–172

This function iterates all cells, calls `getCellTags()` per cell (triggering `useCustomMetadata()` per cell — see PF-1), and is called every time a QuickPick opens:
- `quickPickAllTags()` in `cellActionHelpers.ts`
- `quickPickAllRunGroupTags()` in `commands.ts`
- `filterWebviewProvider.ts`

It also unconditionally calls `log('All tags:', all_tags)` which serializes the entire tag array to JSON every call (even when debug logging is off, `myChannel.appendLine` is still invoked).

**Recommendation:** The `AllTagsTreeDataProvider._tags` map is already the live, debounce-updated source of truth; expose a `getAllTagNames()` method from it and use that instead of rescanning. Remove the unconditional `log()` call or guard it.

---

#### PF-5 — MEDIUM: `contextKeys.updateContextKeys()` scans all open notebook documents on every document open and editor switch

**File:** `src/notebookRunGroups/contextKeys.ts` lines 20–46

```ts
vscode.workspace.notebookDocuments.forEach((notebookDocument) => {
    notebookDocument.getCells().forEach((cell) => {
        const cellGroups = getCellRunGroupMetadata(cell);
        // ...
    });
});
```

Triggered by `onDidOpenNotebookDocument` and `onDidChangeActiveNotebookEditor`. With 5 open notebooks of 100 cells each, every editor switch calls this — 500 cell iterations, each reading cell metadata.

**Recommendation:** The note in the source says "this feels clean" but acknowledges the perf concern. At minimum, scope the scan to the newly active notebook only. The results set is already indexed by URI so a per-notebook update is safe.

---

#### PF-6 — MEDIUM: `scrollbarDecorators.updateDecorationsForTag()` rebuilds the URI→editor map once per tag

**File:** `src/noteAllTags/scrollbarDecorators.ts` lines 254–279

Inside `updateAllDecorations()` → `updateDecorationsForTag()`, a fresh `Map` of visible text editors is constructed for each tag:

```ts
const uriToEditor = new Map(
    vscode.window.visibleTextEditors.map(e => [e.document.uri.toString(), e] as const)
);
```

For N tags, this runs N times per scheduled decoration update. The outer `updateAllDecorations()` loop should build this map once and pass it in.

---

#### PF-7 — LOW: `sortTags()` for `Priority` mode reads raw notebook metadata directly instead of using `TagPropertiesManager`

**File:** `src/noteAllTags/tagSorting.ts` lines 78–97

```ts
const metadata = activeNotebook.metadata || {};
const tagProperties = metadata['tagProperties'] || {};
```

This bypasses `TagPropertiesManager.getAllTagProperties()` and reads metadata directly, inconsistently with the rest of the codebase. The `getChildren()` method of the tree provider also calls `sortTags()` on every tree expansion, re-reading metadata each time.

---

#### PF-8 — LOW: `recordCellExecution()` deserializes and re-serializes the entire execution history on every cell execution

**File:** `src/cellExecution/cellExecutionTracking.ts` lines 89–105

```ts
const allHistory = context.globalState.get<Record<string, NotebookExecutionHistory>>(EXECUTION_HISTORY_KEY, {});
allHistory[notebookUri.toString()] = history;
context.globalState.update(EXECUTION_HISTORY_KEY, allHistory);
```

`globalState.get` returns a deserialized copy of the full history object each time, and `globalState.update` re-serializes the entire map. In a long session with hundreds of cell executions this object grows unboundedly — there is no pruning logic.

**Recommendation:** Keep an in-memory per-session cache and only persist to `globalState` periodically (e.g., on `onDidCloseNotebookDocument`), or limit history to the last N executions.

---

### 2. Reliability Issues

---

#### RL-1 — HIGH: `updateCellRunGroupMetadata()` drops `applyEdit` result silently

**File:** `src/notebookRunGroups/util/cellMetadataHelpers.ts` line 31

```ts
vscode.workspace.applyEdit(wsEdit);  // missing await, return value ignored
```

The `applyEdit` call is not `await`-ed and its `Promise<boolean>` is discarded. If the edit fails (e.g., document was closed, concurrent edit conflict), the failure is completely silent. This function is the primary way run-group metadata is written.

**Recommendation:** `await vscode.workspace.applyEdit(wsEdit)` and handle `false` return.

---

#### RL-2 — HIGH: `updateContext()` triggers `JumpbackDataSource.loadFromNotebook()` on every text-selection change

**File:** `src/extension.ts` lines 72–77, 127–160

```ts
vscode.window.onDidChangeTextEditorSelection(updateContext),
```

`updateContext()` is wired to `onDidChangeTextEditorSelection` — fired on every cursor move in any text editor. The function unconditionally calls `JumpbackDataSource.loadFromNotebook(editor.notebook)` which reads and parses `notebook.metadata.jumpbackList` on every invocation, even when the user is just scrolling in the notebook.

Additionally, five separate `executeCommand('setContext', ...)` calls are made on every invocation, each of which is a VS Code IPC round-trip.

**Recommendation:** Debounce `updateContext()` (100–150 ms). Cache the last-known `hasJumpback` state and skip the IPC calls when nothing changed. At minimum, separate the cheap `notebookActive`/`jumpbackTargetActive` checks from the expensive `hasJumpback` load.

---

#### RL-3 — MEDIUM: `notebookRunGroups/commands.ts` throws if Jupyter extension is not installed at activation

**File:** `src/notebookRunGroups/commands.ts` lines 56–62

```ts
const jupyterExt = vscode.extensions.getExtension<Jupyter>('ms-toolsai.jupyter');
if (!jupyterExt) {
    throw new Error('Jupyter Extension not installed');
}
if (!jupyterExt.isActive) {
    jupyterExt.activate();  // fire-and-forget activation
}
```

This code runs unconditionally in `registerCommands()`, called from `activateNotebookRunGroups()`. If the Jupyter extension is not yet installed (valid during first-run or when Jupyter is disabled), the entire extension activation throws. The `jupyterExt.activate()` call is also a fire-and-forget async call — if activation fails, the error is swallowed.

**Recommendation:** Wrap in a try/catch, log the error, and skip the kernel-execution command registration gracefully. `await jupyterExt.activate()` and handle failures.

---

#### RL-4 — MEDIUM: `cellTags/cellTags.ts` — `getAllTagsFromActiveNotebook()` called at module registration time

**File:** `src/cellTags/cellTags.ts` lines 149–151

```ts
// Test getAllTagsFromActiveNotebook function
const tags = getAllTagsFromActiveNotebook();
log('Retrieved tags:', tags);
```

This is top-level code inside `register()` — it executes at extension activation, before any notebook is open. It always returns `null` at that point (no active editor), the `log()` call serializes the result to JSON and writes to the output channel, and it has no functional purpose. It is dead debug code left in the activation path.

**Recommendation:** Remove these two lines.

---

#### RL-5 — MEDIUM: `changeSortOrder()` in `AllTagsTreeDataProvider` fires `showQuickPick().then()` without error handling

**File:** `src/noteAllTags/allNotebookTagsTreeDataProvider.ts` lines 157–165

```ts
vscode.window.showQuickPick(options, {
    placeHolder: 'Select tag sort order'
}).then(selection => {
    if (selection) { ... }
});
```

The `.then()` chain has no `.catch()`. If the configuration write throws (e.g., settings file is read-only), the error is silently swallowed.

**Recommendation:** Use `async/await` with a try/catch, or add `.catch(err => log('Sort order change failed:', err))`.

---

#### RL-6 — MEDIUM: `cellHeadings/commands.ts` — `increaseSelectionDepth` / `decreaseSelectionDepth` apply one `WorkspaceEdit` per cell sequentially, each potentially conflicting

**File:** `src/cellHeadings/commands.ts` lines 139–165, 234–269

```ts
for (const cell of cellsToModify) {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(cell.document.uri, range, newText);
    await vscode.workspace.applyEdit(edit);  // N sequential edits
}
```

A new `WorkspaceEdit` is created and applied for each cell individually. This is functionally correct for markdown cells (each has its own `TextDocument`), but N separate applied edits means N undo-stack entries and N `onDidChangeNotebookDocument` events, each of which triggers the 250 ms debounce timer reset.

**Recommendation:** Collect all replacements into a single `WorkspaceEdit` and apply once. All `edit.replace()` calls on distinct URIs can be batched into one `WorkspaceEdit`.

---

#### RL-7 — MEDIUM: `importTags/importTags.ts` applies one `updateCellTags` per cell with no batching

**File:** `src/importTags/importTags.ts` lines 30–41

```ts
for (const [index, cellTags] of Object.entries(tagsData)) {
    await updateCellTags(cell, tagsArray as string[]);
    cellsUpdated++;
}
```

Importing tags across a 100-cell notebook issues 100 sequential `WorkspaceEdit` operations, each triggering `onDidChangeNotebookDocument`.

**Recommendation:** Use `updateCellTags(..., defer_apply: true)` to collect `NotebookEdit` objects and apply in a single `WorkspaceEdit`.

---

#### RL-8 — LOW: `helper.ts` — `updateAndSaveCellMetadata()` calls `vscode.workspace.saveAll(false)` on every tag update

**File:** `src/helper.ts` lines 63–84

```ts
if (success) {
    await vscode.workspace.saveAll(false); // saves ALL unsaved documents
}
```

`saveAll(false)` saves every unsaved document in the workspace, not just the notebook being tagged. This is a side-effect far beyond the intended scope and would save unrelated dirty files the user may not want persisted yet. This function does not appear to be called from any active path (only `updateCellTags` is used), but it is exported and could be triggered by future code.

**Recommendation:** Replace with a targeted save of the specific notebook URI, or remove this function if it is no longer used.

---

### 3. Event Listener Hygiene

---

#### EL-1 — HIGH: `AllTagsTreeDataProvider._editorDisposables` are not cleared when the provider is disposed if no editor change happens

**File:** `src/noteAllTags/allNotebookTagsTreeDataProvider.ts` lines 108–130, 259–261

`registerEditorListeners()` pushes to `_editorDisposables` and also pushes a cleanup disposable for the debounce timer. However, the provider's `dispose()` only disposes `_editorDisposables` in bulk — it does not call `clearTimeout` on `_updateTagsTimer` directly at disposal time unless the cleanup disposable was pushed into `_editorDisposables`. The cleanup disposable IS pushed into `_editorDisposables`, so this is safe **as long as** `registerEditorListeners()` was called. If `dispose()` is called before any notebook editor is ever activated, `_editorDisposables` is empty and the timeout cleanup disposable was never registered — any timer started by a race condition is leaked.

Additionally, the provider is never `dispose()`d because it is never pushed to `context.subscriptions`. The `register()` function creates the provider but does not call `context.subscriptions.push(treeDataProvider)`.

**File:** `src/noteAllTags/allNotebookTagsTreeDataProvider.ts` line ~325 (the `register` function body)

**Recommendation:** `context.subscriptions.push(treeDataProvider)` after creation. Also directly `clearTimeout(this._updateTagsTimer)` at the start of `dispose()`.

---

#### EL-2 — HIGH: `JumpbackTreeDataProvider` subscribes to `onDidChangeNotebookDocument` without filtering by active editor URI consistently

**File:** `src/cellJumpbacks/JumpbackTreeDataProvider.ts` lines 67–75

```ts
context.subscriptions.push(vscode.workspace.onDidChangeNotebookDocument((e) => {
    const active = vscode.window.activeNotebookEditor;
    if (active && e.notebook.uri.toString() === active.notebook.uri.toString()) {
        updateJumpbackView();
    }
}));
```

`updateJumpbackView()` calls `JumpbackDataSource.loadFromActiveEditor()` which reads and parses `notebook.metadata` on every notebook change event that matches the active URI. There is no debouncing here — every cell edit, output change, or metadata update in the active notebook will synchronously parse the jumpback list from notebook metadata.

**Recommendation:** Debounce `updateJumpbackView` (100–200 ms) similar to the `AllTagsTreeDataProvider` pattern. Additionally, filter to changes that actually affect notebook-level metadata (`e.metadata` changed) rather than any cell change.

---

#### EL-3 — MEDIUM: `CellSelectionsStatusBarItem` subscribes to `onDidChangeNotebookEditorSelection` without debouncing

**File:** `src/statusBar.ts` lines 25–31

```ts
this.disposables.push(
    vscode.window.onDidChangeNotebookEditorSelection(() => this.update())
);
```

`this.update()` calls `notebookRangesToIndices()` — which iterates all selection ranges and builds a sorted array — on every selection change event (fired per keystroke in multi-select mode). Not debounced.

**Recommendation:** Debounce the status bar update to ~50 ms.

---

#### EL-4 — LOW: `globalThis._debug` assignment overwrites any previous debugging state unconditionally on each activation

**File:** `src/noteAllTags/allNotebookTagsTreeDataProvider.ts` line 329

```ts
globalThis._debug = {};
globalThis._debug.tagsTreeProvider = treeDataProvider;
```

This assigns a plain object to `globalThis._debug`, clobbering any existing `_debug` properties set by other modules. The guarded version (commented out above it) was the correct approach. It is also a TypeScript `declare global` pollution that is present in production code.

**Recommendation:** Either remove the debug global or restore the guarded version (`if (!globalThis._debug) globalThis._debug = {}`).

---

### 4. Debouncing / Throttling

The debouncing situation is mixed — newer code does this well, older code does not.

| Path | Debounced? | Notes |
|------|-----------|-------|
| `AllTagsTreeDataProvider` notebook changes | ✅ 250 ms | Good |
| `ScrollbarDecoratorManager` notebook changes | ✅ 200 ms | Good |
| `ExecutedCellsTreeDataProvider` notebook changes | ✅ 500 ms | Good |
| `updateContext()` in extension.ts | ❌ | Fires on every cursor move |
| `JumpbackTreeDataProvider.updateJumpbackView` | ❌ | Fires on every notebook change |
| `CellSelectionsStatusBarItem.update()` | ❌ | Fires on every selection change |
| `contextKeys.updateContextKeys()` | ❌ | Fires on every editor change / doc open |

---

### 5. Async Patterns

---

#### AP-1 — MEDIUM: `registerCommands()` — `jupyterExt.activate()` is fire-and-forget

**File:** `src/notebookRunGroups/commands.ts` line 60

```ts
jupyterExt.activate();  // Promise not awaited
```

If Jupyter extension activation fails, the error is silently dropped and subsequent commands that rely on the Jupyter API will fail with cryptic errors.

---

#### AP-2 — LOW: `changeSortOrder()` uses `.then()` without error handling (already noted in RL-5)

---

#### AP-3 — LOW: `cellVisualHighlight.ts` — `highlightCell()` fire-and-forget in some callers

**File:** `src/noteAllTags/allNotebookTagsTreeDataProvider.ts` line ~406

```ts
await highlightCell(cellIndex, { ... });
```

The `highlightCell` function is `async` and is awaited here — this is correct. However, `highlightCell` itself uses `setTimeout` callbacks that run after the `await` returns, and if `highlightDecorationType` is disposed between the `await` and the callback fire, the callback accesses a disposed object:

```ts
const deco = highlightDecorationType;
setTimeout(() => {
    if (deco && !textEditor.document.isClosed) {
        textEditor.setDecorations(deco, []);  // deco may be disposed
    }
}, duration);
```

The `deco` reference is kept, but `deco.dispose()` can be called from `disposeCellHighlight()` concurrently (e.g., during extension deactivation). Calling `setDecorations` on a disposed `TextEditorDecorationType` does not throw but silently no-ops in current VS Code — this is acceptable behavior but relies on an undocumented guarantee.

---

### 6. Tree View Refresh Patterns

| Provider | Refresh trigger | Is it filtered? |
|----------|----------------|-----------------|
| `AllTagsTreeDataProvider` | `onDidChangeNotebookDocument` | ✅ `notebookChangeMayAffectTags()` filter + 250 ms debounce |
| `ScrollbarDecoratorManager` | `onDidChangeNotebookDocument` | ✅ same filter + 200 ms debounce |
| `JumpbackTreeDataProvider` | `onDidChangeNotebookDocument` | ❌ No tag-relevance filter — fires on any cell change in active notebook |
| `ExecutedCellsTreeDataProvider` | `onDidChangeNotebookDocument` | ✅ filters for `executionSummary` or `contentChanges` |

The `JumpbackTreeDataProvider` is the outlier — it refreshes on all notebook changes, including output updates and typing, not just metadata changes that could affect the jumpback list.

---

### 7. Data Source Consistency

---

#### DS-1 — MEDIUM: `AllTagsTreeDataProvider._tags` map can diverge from actual notebook metadata when `registerEditorListeners()` is re-called

**File:** `src/noteAllTags/allNotebookTagsTreeDataProvider.ts` lines 108–129

When the active notebook editor changes, `registerEditorListeners()` disposes previous editor listeners and sets up new ones, but only calls `updateTags(editor)` at the end — not `updateTags(undefined)` first. If the new editor triggers an `onDidChangeNotebookDocument` before `updateTags()` completes (possible since `updateTags` is async), the map may momentarily reflect a mix of old-editor tags and new-editor tags.

**Recommendation:** Clear `_tags` synchronously at the start of `registerEditorListeners()` before any async work, then fire the `onDidChangeTreeData` event, then start the async update.

---

#### DS-2 — LOW: `TagTreeItem` reads `activeNotebookEditor` at construction time, which may differ from the editor whose data was used to populate the tree

**File:** `src/noteAllTags/TagTreeItem.ts` lines 17, 69

The tree provider builds its `_tags` map from the editor passed to `updateTags()`, but `TagTreeItem` independently reads `vscode.window.activeNotebookEditor` at construction time. If the active editor switches between `updateTags()` populating `_tags` and VS Code calling `getTreeItem()`, the tree will show tag names from one notebook but properties (color, priority) from a different notebook.

**Recommendation:** Pass the notebook reference explicitly through to `TagTreeItem` instead of re-reading the active editor.

---

#### DS-3 — LOW: `reviveCell()` in `notebookSelection.ts` does a linear scan of all cells in all open notebooks

**File:** `src/util/notebookSelection.ts` lines 165–185

```ts
for (const document of vscode.workspace.notebookDocuments) {
    for (const cell of document.getCells()) {
        if (cell.document.uri.toString() === cellUriStr) {
```

Called on every `addTag` command invocation. For a workspace with many open notebooks, this is O(total_cells_across_all_notebooks). The inner `break` works for the cell loop but not the document loop — a labeled break is needed or the function should return early.

---

## Summary Priority Table

| ID | Severity | Category | Short Description |
|----|----------|----------|-------------------|
| PF-1 | HIGH | Performance | `useCustomMetadata()` calls `getExtension()` on every tag read |
| PF-2 | HIGH | Performance | `TagTreeItem` clones all tag properties once per node per render |
| RL-1 | HIGH | Reliability | `applyEdit` not awaited in `updateCellRunGroupMetadata` |
| RL-2 | HIGH | Reliability | `updateContext()` runs expensive jumpback load on every cursor move |
| EL-1 | HIGH | Event Hygiene | `AllTagsTreeDataProvider` never pushed to `context.subscriptions` |
| EL-2 | HIGH | Event Hygiene | `JumpbackTreeDataProvider` not debounced, parses metadata on every notebook change |
| PF-3 | MEDIUM | Performance | `addTagsToMultipleCells` issues N separate WorkspaceEdits |
| PF-4 | MEDIUM | Performance | `getAllTagsFromActiveNotebook` rescans all cells on every QuickPick open |
| PF-5 | MEDIUM | Performance | `updateContextKeys` scans all open notebooks on every editor switch |
| PF-6 | MEDIUM | Performance | Scrollbar decorator rebuilds editor URI map once per tag per update |
| RL-3 | MEDIUM | Reliability | `registerCommands` throws if Jupyter extension absent |
| RL-4 | MEDIUM | Reliability | Dead debug code executes at activation time |
| RL-5 | MEDIUM | Reliability | `changeSortOrder` swallows async errors |
| RL-6 | MEDIUM | Reliability | Heading depth change issues N sequential WorkspaceEdits |
| RL-7 | MEDIUM | Reliability | Tag import issues N sequential WorkspaceEdits |
| EL-3 | MEDIUM | Event Hygiene | Status bar update not debounced |
| AP-1 | MEDIUM | Async | `jupyterExt.activate()` fire-and-forget |
| DS-1 | MEDIUM | Data Consistency | `_tags` map can briefly hold mixed-editor data on editor switch |
| PF-7 | LOW | Performance | `sortTags` Priority mode reads metadata directly instead of via manager |
| PF-8 | LOW | Performance | Execution history grows unboundedly in globalState |
| RL-8 | LOW | Reliability | `updateAndSaveCellMetadata` saves all open documents |
| EL-4 | LOW | Event Hygiene | `globalThis._debug` clobbers previous debug state |
| AP-2 | LOW | Async | `changeSortOrder` `.then()` without catch |
| AP-3 | LOW | Async | Disposed decoration type accessed from closure after `highlightCell` returns |
| DS-2 | LOW | Data Consistency | `TagTreeItem` reads active editor independently from tree data |
| DS-3 | LOW | Data Consistency | `reviveCell` linear scan across all open notebooks with no early return |

---

## Recommended Fix Order

1. **PF-1** — one-line cache for `useCustomMetadata()` — zero risk, immediate perf win across all hot paths.
2. **RL-1** — add `await` to `applyEdit` in `cellMetadataHelpers.ts` — trivial, prevents silent data-loss.
3. **RL-2 + EL-2** — debounce `updateContext()` and `updateJumpbackView` — reduces IPC noise under typing.
4. **EL-1** — push `treeDataProvider` to `context.subscriptions` — prevents the provider from leaking on extension reload.
5. **PF-2** — pass pre-fetched properties into `TagTreeItem` — removes O(N²) metadata cloning during tree renders.
6. **PF-3 + RL-7** — batch `WorkspaceEdit` in multi-cell tag operations — unblocks UX for large notebooks.
7. **RL-3** — graceful fallback when Jupyter extension is absent at activation.
