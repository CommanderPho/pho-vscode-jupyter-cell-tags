---
name: Git Modified Cells View
overview: Add an Explorer tree view that lists cells in the active notebook changed vs git HEAD (modified/added), with click-to-reveal navigation—reusing the existing gitDiff compare machinery and mirroring the Executed Cells tree pattern.
todos:
  - id: extract-diff-helper
    content: Export shared vs-HEAD (and commit) notebook cell-diff helper from gitDiffProvider.ts
    status: completed
  - id: tree-provider
    content: Add GitModifiedCellsTreeDataProvider with refresh, select/reveal, and notebook listeners
    status: completed
  - id: startup-wire
    content: Register tree + commands from gitDiff/startup.ts
    status: completed
  - id: package-json
    content: Contribute view, welcome, refresh command, and activation in package.json
    status: completed
isProject: false
---

# Git Modified Cells vs HEAD (Browsable Tree)

## Goal

For the **active notebook**, show a browsable list of cells that differ from **git HEAD**, and on click **select + reveal** that cell (same UX as Executed Cells). No cell-level side-by-side diff; no multi-commit aggregation.

## Approach

Reuse existing compare logic in [`src/gitDiff/gitDiffProvider.ts`](src/gitDiff/gitDiffProvider.ts) (`getRepoRoot`, `getRelativeGitPath`, `getFileAtCommit`, `parseNotebookCells`, `compareCells`) and mirror the tree/registration pattern in [`src/cellExecution/ExecutedCellsTreeDataProvider.ts`](src/cellExecution/ExecutedCellsTreeDataProvider.ts).

```mermaid
flowchart LR
  ActiveNb[Active notebook] --> DiffHead[diff vs HEAD]
  DiffHead --> Tree[Git Modified Cells tree]
  Tree -->|click| Reveal[select + reveal cell]
```

## Implementation

### 1. Extract a reusable vs-HEAD diff helper

In [`src/gitDiff/gitDiffProvider.ts`](src/gitDiff/gitDiffProvider.ts), add an exported async function (e.g. `diffActiveNotebookVsHead`) that:

- Requires active notebook with `file:` URI
- Loads `HEAD` content via existing helpers
- Builds current `CellSource[]` from the live notebook
- Returns `CellDiffResult` plus enough context for the tree (or throw/return a typed empty/error result for “not in git”, “file not in HEAD”, etc.)

Refactor `GitDiffCellHighlighter.compareWithCommit` lightly so both highlight and the tree share the same parse/compare path for `HEAD` (avoid duplicating the LCS setup). Keep existing highlight commands unchanged in behavior.

### 2. New tree view module

Add [`src/gitDiff/GitModifiedCellsTreeDataProvider.ts`](src/gitDiff/GitModifiedCellsTreeDataProvider.ts):

- Flat list of items: `Cell N · Modified|Added` with short source preview (same style as Executed Cells)
- Icons: e.g. `$(diff-modified)` / `$(diff-added)` (or theme icons matching gitDiff colors conceptually)
- Item command: `jupyter-cell-tags.gitDiff.selectModifiedCell` → set `NotebookRange`, `revealRange(..., AtTop)`, and a short `highlightCell()` pulse from [`src/util/cellVisualHighlight.ts`](src/util/cellVisualHighlight.ts)
- `refresh()` runs the vs-HEAD diff asynchronously; show empty tree + welcome when no changes
- Listeners: `onDidChangeActiveNotebookEditor`, debounced `onDidChangeNotebookDocument` for the active notebook (so edits update the list), plus a view-title **Refresh** command

Optional grouping: two collapsible parents **Modified** / **Added** if counts are non-trivial; default to flat list sorted by cell index if simpler and clearer.

### 3. Wire activation

Extend [`src/gitDiff/startup.ts`](src/gitDiff/startup.ts) to register the tree provider and select/refresh commands alongside the existing highlighter commands. No change needed to [`src/extension.ts`](src/extension.ts) beyond the existing `activateGitDiffHighlighting` call.

### 4. `package.json` contributes

- **View** under `explorer`: id `git-modified-cells-view`, name e.g. `Git Modified Cells`, `when: jupyter-cell-tags.notebookActive`, icon `$(git-compare)`
- **Commands**: `gitDiff.refreshModifiedCells`, `gitDiff.selectModifiedCell` (select can be internal / not shown in palette)
- **view/title** Refresh on that view
- **viewsWelcome**: short messages for “no notebook”, “no changes vs HEAD”, “not in a git repo / not tracked”
- **activationEvents**: `onView:git-modified-cells-view` (and command activations if exposed)

### 5. Edge cases (handled in provider)

- Non-`file` notebooks → empty + welcome
- Outside git / `git show HEAD:path` fails → empty + error-aware welcome / status message once
- Cell index out of range after edit → skip invalid indices on refresh
- Large notebooks: reuse existing 50MB `maxBuffer`; tree only lists changed indices (not full history walk)

## Out of scope

- Side-by-side / inline cell content diffs
- Multi-commit timeline / last-N aggregation
- Workspace-wide scan of all `.ipynb` files
- Changing existing highlight-vs-HEAD decoration behavior (tree is complementary; users can still run highlight commands)

## Manual test checklist

- Open a tracked `.ipynb`, edit a cell, confirm it appears under Git Modified Cells; click reveals it
- Add a new cell → listed as Added
- Save + commit → list clears (or refresh clears)
- Switch notebooks → list updates
- Untracked / non-git folder → welcome, no crash
