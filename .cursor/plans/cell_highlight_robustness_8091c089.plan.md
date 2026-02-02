---
name: Cell highlight robustness
overview: Harden [cellVisualHighlight.ts](src/util/cellVisualHighlight.ts) against uninitialized state, disposed resources, empty documents, async races, and timer/decoration leaks; optionally allow callers to pass notebook context to avoid activeNotebookEditor races.
todos: []
isProject: false
---

# Optimize Cell Visual Highlight for Robustness/Reliability

## Current risks

- **Uninitialized / disposed decoration**: `highlightDecorationType` can be `undefined` if `highlightCell` runs before `initializeCellHighlight()`, or disposed if used after `deactivate()`. Code uses `highlightDecorationType!` in the static-branch timeout and in `applyPulseEffect` (lines 62–63, 135).
- **Empty document**: [getCellFullRange](src/util/cellVisualHighlight.ts) uses `document.lineAt(document.lineCount - 1)`; when `lineCount === 0` this throws (invalid line -1).
- **Stale context after async**: `highlightCell` reads `activeNotebookEditor` once; after `revealRange`, `waitForCellTextEditor`, and pulse `delay()`s, the user may have switched/closed the notebook. Decorations and cleanup then run against the wrong or closed editor.
- **Pulse effect leaks**: In `applyPulseEffect`, `brightDeco`/`dimDeco` are created each loop iteration; if an exception or early exit occurs before `dispose()`, those decoration types are leaked. The final clear uses `highlightDecorationType!` which may already be disposed.
- **disposeCellHighlight**: After calling `highlightDecorationType?.dispose()`, the variable is not set to `undefined`, so later `highlightCell` could still reference the disposed type.
- **Static-branch timeout**: The `setTimeout` that clears decorations (lines 61–64) does not check that the document/editor is still valid or that the decoration type is still valid before calling `setDecorations`; no way to cancel the timeout if the editor is closed.

## Implementation plan

### 1. [cellVisualHighlight.ts](src/util/cellVisualHighlight.ts) – Initialization and disposal

- **Lazy init**: At the start of `highlightCell`, if `highlightDecorationType` is undefined, call `initializeCellHighlight()` so the feature works even if call order changes. Alternatively, early-return with a no-op and document that `initializeCellHighlight()` must run first (current extension.ts already calls it in `activate`).
- **Disposal**: In `disposeCellHighlight()`, after `highlightDecorationType?.dispose()`, set `highlightDecorationType = undefined` so no code uses a disposed reference.
- **No non-null assertions**: Before every use of `highlightDecorationType`, check that it is defined; if not, skip applying/clearing that decoration (and optionally lazy-init once).

### 2. [cellVisualHighlight.ts](src/util/cellVisualHighlight.ts) – getCellFullRange

- Handle empty document: when `document.lineCount === 0`, return `new vscode.Range(0, 0, 0, 0)` instead of calling `lineAt(-1)`.

### 3. [cellVisualHighlight.ts](src/util/cellVisualHighlight.ts) – Stale context after async

- After `editor.revealRange` (and any other `await`), re-resolve the “current” notebook/editor:
  - Either keep a single “target” identity at the start (e.g. `notebook.uri.toString()` and `cellIndex`) and after each `await` check that `vscode.window.activeNotebookEditor?.notebook.uri.toString() === targetUri` and `cellIndex < notebook.cellCount`; if not, abort (return without applying/clearing).
  - Or accept an optional parameter (e.g. `notebookUri?: vscode.Uri`) so the caller can pass the notebook when known (e.g. from the All Tags view); then validate that `activeNotebookEditor?.notebook.uri` matches that URI after each await. This makes the “clicked” notebook authoritative and avoids races when multiple notebooks are open.
- In `waitForCellTextEditor`, if the cell’s document is closed (`cell.document.isClosed`) during the wait, return `undefined` and have `highlightCell` exit cleanly.

### 4. [cellVisualHighlight.ts](src/util/cellVisualHighlight.ts) – applyPulseEffect

- Use try/finally so that every created `brightDeco` and `dimDeco` is always disposed, even on throw or early return.
- Before the final “Clear” step, check `highlightDecorationType` is defined (and optionally that the document is still open). Only then call `textEditor.setDecorations(highlightDecorationType, [])`. Remove the non-null assertion.

### 5. [cellVisualHighlight.ts](src/util/cellVisualHighlight.ts) – Static-branch setTimeout

- Before calling `setDecorations(..., [])` in the timeout callback, check that `highlightDecorationType` is still defined and that the document is not closed (e.g. `!textEditor.document.isClosed`). If either is false, skip the clear (and do not use the disposed type).
- Optionally store the timeout id and clear it in `disposeCellHighlight` if you add a module-level “pending timeout” ref; for a short-lived decoration this is a minor improvement and can be omitted in favor of the guard above.

### 6. Optional API for caller context

- Extend `highlightCell(cellIndex, options)` with an optional way to pass notebook context, e.g. `options.notebookUri?: vscode.Uri`. After each async step, if `notebookUri` was provided, require `activeNotebookEditor?.notebook.uri.toString() === notebookUri.toString()` (and valid cell index); otherwise keep current behavior (match by current `activeNotebookEditor` only). This avoids races when the All Tags view is used with multiple notebooks.
- In [allNotebookTagsTreeDataProvider.ts](src/noteAllTags/allNotebookTagsTreeDataProvider.ts) (e.g. around the `jupyter-cell-tags.openNotebookCell` handler at 320–359), when calling `highlightCell`, pass the editor’s `notebook.uri` if available (e.g. `highlightCell(cellIndex, { duration: 1500, pulse: true, pulseCount: 2, notebookUri: editor.notebook.uri })`). No change to the command signature (still receives `cellIndex`); the handler already has `editor`.

### 7. [extension.ts](src/extension.ts)

- No change required for lifecycle: `initializeCellHighlight()` in `activate` and `disposeCellHighlight()` in `deactivate` are correct. Optionally register `disposeCellHighlight` with `context.subscriptions.push({ dispose: disposeCellHighlight })` so deactivation is consistent with other disposables; the explicit `deactivate()` call remains valid.

## Summary of file changes


| File                                                                                                     | Change                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [src/util/cellVisualHighlight.ts](src/util/cellVisualHighlight.ts)                                       | Lazy-init or guard for `highlightDecorationType`; set to `undefined` in dispose; safe `getCellFullRange` for empty doc; re-validate notebook/editor after async and in wait loop; try/finally and guarded clear in `applyPulseEffect`; guarded timeout clear in static branch; optional `notebookUri` in options and validation. |
| [src/noteAllTags/allNotebookTagsTreeDataProvider.ts](src/noteAllTags/allNotebookTagsTreeDataProvider.ts) | Pass `notebookUri: editor.notebook.uri` into `highlightCell` when calling from `openNotebookCell`.                                                                                                                                                                                                                               |
| [src/extension.ts](src/extension.ts)                                                                     | Optional: add `disposeCellHighlight` to `context.subscriptions`.                                                                                                                                                                                                                                                                 |


## Testing focus

- Call “Focus cell” from All Tags view with a single notebook: highlight and pulse appear, then clear.
- Switch to another notebook or close the notebook during the pulse: no errors, no decorations on wrong editor.
- Deactivate extension while a highlight or pulse is active: no use-after-dispose.
- Empty cell (0 lines): no throw from `getCellFullRange`.

