# Implementation Plan — Performance & Reliability Fixes
**vscode-jupyter-cell-tags**
**Date:** 2025-07-11
**Fixes:** PF-1, PF-2, RL-1, RL-2, EL-1, EL-2

---

## Pre-flight findings

These are the concrete facts discovered by reading the source files — every plan item below is grounded in them.

### PF-1 (`notebookMetadata.ts`)
Current `useCustomMetadata()` (lines 7–12) re-evaluates `vscode.extensions.getExtension('vscode.ipynb')` on every call with no caching. The `dropCustomMetadata` flag does not change within a session.

### PF-2 (`TagTreeItem.ts`, `allNotebookTagsTreeDataProvider.ts`)
- `TagTreeItem` constructor (line 17) calls `this.getTagProperties(tagName)` → `TagPropertiesManager.getTagProperties(notebook, tagName)` → `TagPropertiesManager.getAllTagProperties(notebook)`, which iterates all keys and shallow-clones the entire map on every call.
- `getTreeItem()` in `AllTagsTreeDataProvider` (line ~200) constructs a `new TagTreeItem(element, ...)` for each tag node; VS Code calls `getTreeItem()` once per visible node.
- `updateTags()` already has the notebook in scope from the `editor` parameter, making it the natural place to call `getAllTagProperties()` once — but `updateTags` is async and only stores tags in `_tags: Map<string, CellReference[]>`. The tree item shape (with description, tooltip, icon) is built lazily in `getTreeItem()`, not in `updateTags()`.
- Decision: pass pre-fetched properties via `getTreeItem()`. When element is a string (tag node), call `TagPropertiesManager.getAllTagProperties(notebook)` **once** per `getTreeItem()` invocation batch — but `getTreeItem` is called one element at a time by VS Code. The correct single call-site is therefore `getTreeItem()` itself: call `getAllTagProperties` once at the top of the `typeof element === 'string'` branch, then pass the resolved entry to the `TagTreeItem` constructor. This reduces N calls to 1 call amortized if VS Code batches `getTreeItem()` calls, and in the worst case (one call per node) is the same cost. The real saving is eliminating the full re-clone inside each `TagTreeItem` constructor call.
- Add an optional `tagProperties?: TagProperties` parameter to the `TagTreeItem` constructor. When provided, skip the internal `getTagProperties()` call.

### RL-1 (`cellMetadataHelpers.ts`)
`updateCellRunGroupMetadata` (line 18) is currently `function` (synchronous). The only caller in the codebase is a **commented-out** import line in `cellActionHelpers.ts` (line 2). There are no active callers to update. Making the function `async` is a safe, isolated change.

### RL-2 (`extension.ts`)
- `updateContext()` is subscribed to four events (lines 72–77): `onDidChangeActiveNotebookEditor`, `onDidChangeNotebookEditorSelection`, `onDidChangeActiveTextEditor`, **`onDidChangeTextEditorSelection`** — the last fires on every cursor keystroke.
- Inside `updateContext()`, when a notebook cell is selected, `JumpbackDataSource.loadFromNotebook(editor.notebook)` reads `editor.notebook.metadata.jumpbackList` (a metadata parse) on every invocation.
- `log` is imported from `./util/logging`.
- The five `setContext` IPC calls run unconditionally each time, even when nothing changed.
- Fix: add a module-level debounce timer variable. Wire all four event subscriptions to a debounce wrapper. Cache the last-sent values of the five context keys. Only call `vscode.commands.executeCommand('setContext', ...)` when the value differs from the cache.

### EL-1 (`allNotebookTagsTreeDataProvider.ts`)
- The `register()` function (line ~295) creates `treeDataProvider` but never calls `context.subscriptions.push(treeDataProvider)`.
- `dispose()` iterates `_editorDisposables` to run the `clearTimeout` cleanup disposable, but `_editorDisposables` is only populated by `registerEditorListeners()`, which is only called when a notebook editor is activated. If `dispose()` is called before any notebook editor activates, `_editorDisposables` is empty and `_updateTagsTimer` (if somehow started) would be leaked.
- Fix: add `context.subscriptions.push(treeDataProvider)` in `register()` after the provider is created. Add `clearTimeout(this._updateTagsTimer); this._updateTagsTimer = undefined;` as the **first** statement in `dispose()`.

### EL-2 (`JumpbackTreeDataProvider.ts`)
- `updateJumpbackView` (local function inside `register()`, lines 64–72) has no debounce.
- The `onDidChangeNotebookDocument` handler (lines 67–75) fires on any change to the active notebook — cell edits, output changes, execution count changes — not only metadata changes.
- `NotebookDocumentChangeEvent.metadata` is typed as `{ [key: string]: any } | undefined` (confirmed in `@types/vscode/index.d.ts`). It is `undefined` when metadata did not change and a defined object when it did.
- The jumpback list lives in `notebook.metadata.jumpbackList` — only notebook-level metadata changes can affect it; cell content/output changes cannot.
- Fix: add a module-level debounce timer inside `register()`. Add a metadata filter: only call the debounced `updateJumpbackView` when `e.metadata !== undefined`.

---

## Implementation Plan

- [ ] 1. **PF-1** — Cache `useCustomMetadata()` result in `notebookMetadata.ts`.
      Add a module-level variable `let _useCustomMetadata: boolean | undefined;`. Rewrite `useCustomMetadata()` to populate it on first call and return the cached value thereafter.
      File: `src/util/notebookMetadata.ts`
      Verify: `nvm use v23.9.0 && npm run compile` — zero TypeScript errors.

- [ ] 2. **RL-1** — Make `updateCellRunGroupMetadata` async and await `applyEdit`.
      Change the function signature to `export async function updateCellRunGroupMetadata(cell: vscode.NotebookCell, newGroupValue: string): Promise<void>`. Replace the bare `vscode.workspace.applyEdit(wsEdit)` on line 31 with:
      ```ts
      const success = await vscode.workspace.applyEdit(wsEdit);
      if (!success) {
          log('updateCellRunGroupMetadata: applyEdit failed for cell', cell.index);
      }
      ```
      Import `log` from `'../../util/logging'` at the top of the file (add the import if not present).
      File: `src/notebookRunGroups/util/cellMetadataHelpers.ts`
      Verify: `npm run compile` — zero TypeScript errors. No other files need changing (the only reference to this function in `cellActionHelpers.ts` is commented out).

- [ ] 3. **PF-2** — Pre-fetch tag properties in `AllTagsTreeDataProvider.getTreeItem()` and pass to `TagTreeItem`.
      **Step A — TagTreeItem.ts:** Add an optional fourth constructor parameter `tagProperties?: TagProperties`. When it is provided, use it directly instead of calling `this.getTagProperties(tagName)`. The fallback path (call `getTagProperties`) remains for any future caller that omits the argument.
      ```ts
      constructor(
          public readonly label: string,
          public readonly collapsibleState: vscode.TreeItemCollapsibleState,
          public readonly tagName: string,
          tagProperties?: TagProperties
      ) {
          super(label, collapsibleState);
          this.contextValue = 'tagItem';
          if (vscode.window.activeNotebookEditor) {
              const properties = tagProperties ?? this.getTagProperties(tagName);
              // ... rest unchanged
          }
      }
      ```
      **Step B — allNotebookTagsTreeDataProvider.ts:** In `getTreeItem()`, inside the `typeof element === 'string'` branch, call `TagPropertiesManager.getAllTagProperties(notebook)` once to get the full map, then pass `allProps[element]` (which may be undefined — that's fine, `TagProperties | undefined` matches the constructor parameter type) as the fourth argument to `TagTreeItem`.
      ```ts
      if (typeof element === 'string') {
          const notebook = vscode.window.activeNotebookEditor?.notebook;
          const allProps = notebook ? TagPropertiesManager.getAllTagProperties(notebook) : {};
          const tagItem = new TagTreeItem(
              element,
              vscode.TreeItemCollapsibleState.Collapsed,
              element,
              allProps[element]
          );
          return tagItem;
      }
      ```
      Files: `src/noteAllTags/TagTreeItem.ts`, `src/noteAllTags/allNotebookTagsTreeDataProvider.ts`
      Verify: `npm run compile` — zero TypeScript errors.

- [ ] 4. **RL-2** — Debounce `updateContext()` and cache last-known context values in `extension.ts`.
      **Step A** — Add a module-level timer variable and a cache object above `updateContext`:
      ```ts
      let _updateContextTimer: ReturnType<typeof setTimeout> | undefined;
      const _contextCache: {
          notebookActive?: boolean;
          jumpbackTargetActive?: boolean;
          singleCellSelected?: boolean;
          multipleCellsSelected?: boolean;
          hasJumpback?: boolean;
      } = {};

      function setContextIfChanged(key: string, value: boolean, cache: Record<string, boolean | undefined>): void {
          if (cache[key] !== value) {
              cache[key] = value;
              vscode.commands.executeCommand('setContext', key, value);
          }
      }
      ```
      **Step B** — Rename the existing `updateContext()` to `_doUpdateContext()`. Add a new `updateContext()` that debounces calls to `_doUpdateContext()` at 150 ms:
      ```ts
      function updateContext(): void {
          if (_updateContextTimer) {
              clearTimeout(_updateContextTimer);
          }
          _updateContextTimer = setTimeout(() => {
              _updateContextTimer = undefined;
              _doUpdateContext();
          }, 150);
      }
      ```
      **Step C** — Inside `_doUpdateContext()`, replace all five `vscode.commands.executeCommand('setContext', key, value)` calls with `setContextIfChanged('jupyter-cell-tags.<key>', value, _contextCache)` using the respective key names. Keep the logic identical — only the IPC dispatch is conditioned on value change.
      File: `src/extension.ts`
      Verify: `npm run compile` — zero TypeScript errors.

- [ ] 5. **EL-1** — Push `AllTagsTreeDataProvider` to `context.subscriptions` and harden `dispose()`.
      **Step A** — In `allNotebookTagsTreeDataProvider.ts`'s `register()` function, add the line immediately after `const treeDataProvider = new AllTagsTreeDataProvider();`:
      ```ts
      context.subscriptions.push(treeDataProvider);
      ```
      **Step B** — In the `dispose()` method of `AllTagsTreeDataProvider`, add as the **first two statements**:
      ```ts
      clearTimeout(this._updateTagsTimer);
      this._updateTagsTimer = undefined;
      ```
      These go before the `this._editorDisposables.forEach(...)` loop so the timer is always cleared regardless of whether `registerEditorListeners()` was ever called.
      File: `src/noteAllTags/allNotebookTagsTreeDataProvider.ts`
      Verify: `npm run compile` — zero TypeScript errors.

- [ ] 6. **EL-2** — Debounce `updateJumpbackView` and filter to metadata-only changes in `JumpbackTreeDataProvider.ts`.
      Inside the `register()` function:
      **Step A** — Add a debounce timer variable above `updateJumpbackView`:
      ```ts
      let updateJumpbackTimer: ReturnType<typeof setTimeout> | undefined;
      ```
      **Step B** — Rename the existing `updateJumpbackView` to `doUpdateJumpbackView`. Add a new `updateJumpbackView` wrapper that debounces at 150 ms:
      ```ts
      const updateJumpbackView = (): void => {
          if (updateJumpbackTimer) {
              clearTimeout(updateJumpbackTimer);
          }
          updateJumpbackTimer = setTimeout(() => {
              updateJumpbackTimer = undefined;
              doUpdateJumpbackView();
          }, 150);
      };
      ```
      Ensure the `onDidChangeActiveNotebookEditor` and `onDidChangeActiveTextEditor` subscriptions still call `updateJumpbackView()` (they should — these are coarse editor-switch events that are infrequent, but debouncing them is harmless and consistent).
      **Step C** — In the `onDidChangeNotebookDocument` handler, add the metadata guard **before** the active-editor URI check:
      ```ts
      context.subscriptions.push(vscode.workspace.onDidChangeNotebookDocument((e) => {
          // Only notebook-level metadata changes can affect the jumpback list
          if (e.metadata === undefined) {
              return;
          }
          const active = vscode.window.activeNotebookEditor;
          if (active && e.notebook.uri.toString() === active.notebook.uri.toString()) {
              updateJumpbackView();
          }
      }));
      ```
      Also push the cleanup disposable for the timer into `context.subscriptions`:
      ```ts
      context.subscriptions.push({ dispose: () => { clearTimeout(updateJumpbackTimer); } });
      ```
      File: `src/cellJumpbacks/JumpbackTreeDataProvider.ts`
      Verify: `npm run compile` — zero TypeScript errors.

- [ ] 7. **Final build verification** — Run the TypeScript compiler from the workspace root with the required Node version.
      Command: `nvm use v23.9.0 && npm run compile`
      Working directory: `c:\Users\pho\repos\VSCode Extensions\vscode-jupyter-cell-tags`
      Expected: compiler exits with code 0 and no error output. If errors remain, fix them before marking this step done.

---

## Notes and edge cases for the implementer

### RL-2 cache key names
The five context keys set in `updateContext()` are:
- `'jupyter-cell-tags.notebookActive'`
- `'jupyter-cell-tags.jumpbackTargetActive'`
- `'jupyter-cell-tags.singleCellSelected'`
- `'jupyter-cell-tags.multipleCellsSelected'`
- `'jupyter-cell-tags.hasJumpback'`

The cache object uses `boolean | undefined` values so the first execution always sends all five `setContext` calls (since `undefined !== false`).

### RL-2 early returns
`updateContext()` currently has two return paths: one for the plain-text editor case (no notebook active) and one for the notebook case. Both paths must use `setContextIfChanged` for all five keys. Pay attention to the early return in the "no notebook" branch where `singleCellSelected` and `multipleCellsSelected` are forced to `false` — these must still go through the cache check so they only fire when they actually change from a prior `true` state.

### PF-2 `allProps[element]` type
`getAllTagProperties` returns `Record<string, TagProperties>` where each value is already a shallow clone (`{ ...props[key] }`). `allProps[element]` will be `TagProperties | undefined` when the tag has no stored properties. The `TagTreeItem` constructor parameter is `tagProperties?: TagProperties` which accepts `undefined`, so no cast is needed.

### EL-2 initial call
The `updateJumpbackView()` call at the bottom of `register()` (line 79) is the initial populate call — it should call the debounced wrapper, not the inner function directly. This is acceptable since it fires once at startup and the 150 ms delay is imperceptible at activation time.

### RL-1 `log` import
`cellMetadataHelpers.ts` currently imports only `vscode`. Add `import { log } from '../../util/logging';` as the second import line.
