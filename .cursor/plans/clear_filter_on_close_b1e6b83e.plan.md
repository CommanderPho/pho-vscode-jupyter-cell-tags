---
name: Clear filter on close
overview: When a notebook closes (or the extension deactivates), clear any active filter and expand cells the filter collapsed, instead of only forgetting in-memory state.
todos:
  - id: close-clear
    content: On notebook close, await manager.clear instead of forget; refresh webview
    status: completed
  - id: dispose-clear-all
    content: Add clearAll() and call it on filter module/manager dispose
    status: completed
isProject: false
---

# Clear filter on notebook close

## Problem

[`startup.ts`](src/notebookFilter/startup.ts) calls `manager.forget(notebook)` on `onDidCloseNotebookDocument`, which drops criteria tracking without expanding. Collapse is applied via `notebook.cell.collapseCellInput` / `Output`, which sets cell metadata — so collapsed non-matches survive reopen.

## Fix

In [`startup.ts`](src/notebookFilter/startup.ts), replace close handling with an async clear:

```ts
vscode.workspace.onDidCloseNotebookDocument(notebook => {
  void (async () => {
    await manager.clear(notebook);
    webviewProvider.postState();
  })();
});
```

`clear` already expands `collapsedByFilter` inputs/outputs, deletes state, and `syncUi`s (decorators/status). No need to call `forget` afterward.

Also on module teardown (the dispose subscription next to timer cleanup, and/or `manager.dispose`), clear every notebook still in `manager`’s state map that is still open — so Extension Host reload / deactivate does not leave collapse behind. Add a small `clearAll()` on [`NotebookFilterManager`](src/notebookFilter/NotebookFilterManager.ts) that iterates `states` keys, resolves each `vscode.workspace.notebookDocuments` match, awaits `clear`, then clears leftovers with `forget` + `decorators.clear()`.

Update `forget`’s comment: only for discarding state when expand is impossible or after clear; not the close path.

## Verification

- Apply filter (non-matches collapse) → close notebook tab → reopen → previously filter-collapsed cells are expanded; no active filter UI.
- Apply filter → Clear Filter → close → reopen → unchanged (no leftover filter state).
- Two notebooks filtered → close one → only that notebook’s cells expand; the other keeps its filter.