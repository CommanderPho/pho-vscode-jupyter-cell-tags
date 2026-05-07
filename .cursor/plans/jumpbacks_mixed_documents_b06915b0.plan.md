---
name: jumpbacks mixed documents
overview: Make jumpbacks document-aware so notebook entries continue to track cells while non-notebook files track stable text editor positions. The implementation will keep notebook metadata unchanged where possible and store plain-file jumpbacks in VS Code workspace state keyed by document URI.
todos:
  - id: model-storage
    content: Generalize jumpback entry model and document-aware persistence.
    status: completed
  - id: commands
    content: Make add/remove commands choose notebook cell or text cursor context reliably.
    status: completed
  - id: view-context
    content: Refresh tree view and context keys for both notebooks and text editors.
    status: completed
  - id: package-wiring
    content: Expose jumpback commands and view in editor contexts.
    status: completed
  - id: verify
    content: Compile and lint-check edited TypeScript files.
    status: completed
isProject: false
---

# Mixed Notebook/File Jumpbacks

## Current Shape

Jumpbacks are currently notebook-only in [`src/cellJumpbacks/jumpbackDataSource.ts`](src/cellJumpbacks/jumpbackDataSource.ts):

```10:15:src/cellJumpbacks/jumpbackDataSource.ts
export interface JumpbackEntry {
    cellIndex: number;
    addedAt: string;
    name?: string;
    note?: string;
}
```

The commands in [`src/cellJumpbacks/commands.ts`](src/cellJumpbacks/commands.ts) require `vscode.window.activeNotebookEditor`, and the tree provider in [`src/cellJumpbacks/JumpbackTreeDataProvider.ts`](src/cellJumpbacks/JumpbackTreeDataProvider.ts) hides data when no notebook is active.

## Implementation Plan

- Extend `JumpbackEntry` into a discriminated model with notebook and text-file variants, preserving legacy `{ cellIndex, addedAt }` notebook entries so existing notebook metadata keeps working.
- Refactor [`src/cellJumpbacks/jumpbackDataSource.ts`](src/cellJumpbacks/jumpbackDataSource.ts) into a document-aware data source:
  - Notebook documents load/persist `jumpbackList` through existing notebook metadata helpers.
  - Text documents load/persist jumpbacks through `context.workspaceState`, keyed by normalized document URI.
  - Duplicate detection/removal will use a stable entry key: notebook `cellIndex`; text file `uri + line + character`.
- Update [`src/cellJumpbacks/commands.ts`](src/cellJumpbacks/commands.ts) so `addJumpback` and `removeJumpback` work from either context:
  - If a notebook cell argument or active notebook selection exists, create/remove a notebook-cell jumpback.
  - Otherwise, use `vscode.window.activeTextEditor.selection.active` for a line/character jumpback.
  - Show document-specific messages such as `cell 3` or `foo.py:42`.
- Update [`src/cellJumpbacks/JumpbackTreeDataProvider.ts`](src/cellJumpbacks/JumpbackTreeDataProvider.ts) so the tree reflects the active notebook or active text editor, labels entries appropriately, and refreshes on both notebook-editor and text-editor changes.
- Update [`src/extension.ts`](src/extension.ts) context handling so `jupyter-cell-tags.hasJumpback` is true for either the selected notebook cell or the active text editor cursor position, while preserving the existing notebook context keys used by unrelated features.
- Update [`package.json`](package.json) contribution wiring so jumpback commands/view are available for normal editor contexts, not only notebook contexts. This likely means adding `editor/context` entries for add/remove jumpback and loosening the `jumpbacks` view `when` clause from `jupyter-cell-tags.notebookActive` to a new jumpback-capable context.

## Verification

- Run `npm run compile` after implementation.
- Use `ReadLints` on edited TypeScript files.
- Manually verify command behavior in a notebook and a `.py` editor. No `*.ipynb` files will be modified as part of this change.