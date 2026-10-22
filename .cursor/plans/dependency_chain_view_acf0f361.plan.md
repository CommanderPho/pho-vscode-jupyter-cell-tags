---
name: Dependency chain view
overview: Add a notebook cell command that statically computes the upstream cells required to run the selected Python cell, highlights them by hop distance in orange, and shows the last 10 chains in a Dependency Chain view.
todos:
  - id: symbol-analysis
    content: Add analyzeSymbols.py plus buildChain.ts (edges, min-hop BFS, tree) and unit tests for the graph builder
    status: completed
  - id: highlight
    content: "Paint the selected chain on visible notebook cells: fading orange background, hop number, overview ruler; clear on switch"
    status: completed
  - id: view-history
    content: Add Dependency Chain explorer view with a 10-chain history, tree navigation, and highlight switching without recomputation
    status: completed
  - id: command-wire
    content: Register the cell context command, activation, and extension startup hook
    status: completed
isProject: false
---

# Dependency Chain highlighting and view

## What this computes

Right-click a Python code cell and run **Dependency Chain: Show Dependant Cells**. The command finds the upstream cells that must run first (the cells this cell depends on), not the cells that depend on it.

Hop numbering is a breadth-first walk of those prerequisite edges:

- **1** — cells that directly define a name this cell uses
- **2** — cells that directly define a name a 1-hop cell uses, and that are not already closer
- and so on, until the closure stops

Each prerequisite cell is kept once, at its smallest hop. The clicked cell is the tree root and is not painted or numbered. Edges only point at earlier code cells, so the graph is acyclic and “last assignment above the use wins,” which matches Go to Definition in notebook source order and Gather’s no-kernel path ([`gatherWithoutKernel`](https://github.com/CommanderPho/vscode-gather/blob/main/src/gather.ts) logs cells from the top through the target, then slices).

```mermaid
flowchart TD
  cmd["Cell context menu"] --> analyze["Python ast: defs, uses, mutations"]
  analyze --> graph["Last-def edges to earlier cells"]
  graph --> bfs["BFS hops and tree"]
  bfs --> history["Per-notebook history, max 10"]
  history --> highlight["Orange highlight plus hop number"]
  history --> view["Dependency Chain view"]
```

## Ideas taken from Gather, without the private feed

[vscode-gather](https://github.com/CommanderPho/vscode-gather) slices with `@msrvida/python-program-analysis` from the [MSR-Python-Analysis feed](https://dev.azure.com/msresearch/MSR%20Engineering/_artifacts/feed/MSR-Python-Analysis/connect/npm). That package returns a flat program slice (`sliceLatestExecution` → `cellSlices`), not hop levels, and it is not usable here without that authenticated feed.

Reuse its behavior, not the package:

- Static top-to-bottom log, same as `gatherWithoutKernel`, instead of a live kernel execution log.
- Last definition of a name wins.
- Be conservative when a call updates an object without rebinding it. Gather’s spec files cover pandas, numpy, and similar. We only copy the cheap rule: a call with `inplace=True`, or a small set of mutating methods (`append`, `extend`, `update`, `add`, `sort`, and assignment through `.loc` / `.iloc`), counts as a new definition of the receiver. Later uses then depend on that cell.
- Free names inside a function or class body count as uses of the cell that defines it, so calling that function later still pulls in the cells those names come from.
- Do not copy Gather’s line-level slice or its `smartSelect` text search. This feature highlights whole cells and stores cell indexes in the snapshot.

Known gaps, shown in the tree rather than guessed: names with no earlier definition, `import *`, `exec`, and cells that fail to parse (line magics `%` / `!` are stripped first; a `%%` cell magic is reported as unparsed).

## Analysis

New folder [`src/dependencyChain/`](src/dependencyChain/).

- [`analyzeSymbols.py`](src/dependencyChain/analyzeSymbols.py) reads `{ "cells": string[] }` on stdin and writes, per cell, `defines`, `uses`, and `mutations` using the stdlib `ast` module. No new npm dependency.
- Resolve Python as: `jupyter-cell-tags.jupyterEnhancements.kernel.pythonPath` when that file exists, otherwise `python` on `PATH`. On failure, show the error and do not change highlights.
- [`buildChain.ts`](src/dependencyChain/buildChain.ts) is pure TypeScript. Given the symbol lists and a target index, it builds edges, BFS hops, and a tree (parent = the cell that first reached it; edge label = the names). Unresolved names sit on the target node. Unit-test this file the same way as [`src/noteAllTags/tagSorting.test.ts`](src/noteAllTags/tagSorting.test.ts).

## Notebook highlighting

Follow the visible-editor pattern in [`src/gitDiff/gitDiffProvider.ts`](src/gitDiff/gitDiffProvider.ts): map cell URI → hop, and reapply `TextEditorDecorationType`s when visible notebook cell editors change.

- One decoration type per hop. Background is orange, strongest at hop 1 (`rgba(255, 140, 0, 0.45)`) and multiplied by about `0.72` each further hop, with a floor so deep hops stay visible.
- The hop number is a `before` decoration on the first line: bright orange `"1"`, then the same fade, plus a matching overview-ruler color.
- Applying a chain clears the previous chain’s decorations first. Only the selected chain is painted.
- Reveal from the tree uses `revealRange` (as in [`src/noteAllTags/allNotebookTagsTreeDataProvider.ts`](src/noteAllTags/allNotebookTagsTreeDataProvider.ts)), not the temporary yellow pulse in [`src/util/cellVisualHighlight.ts`](src/util/cellVisualHighlight.ts).

## Dependency Chain view

Register an explorer view `dependency-chain-view` in [`package.json`](package.json), visible when `jupyter-cell-tags.notebookActive` (same idea as the other notebook views).

- Roots are the last 10 chains for the active notebook, newest first, held in memory for the session. Selecting one only restores its stored snapshot.
- Each chain’s children are the dependency tree: `Cell 12` → `Cell 8  [1]  df, model` → `Cell 3  [2]  df`.
- Clicking a chain root switches notebook highlighting to that chain. Clicking a cell reveals it.
- The active chain is marked in the label. A view-title command clears highlights.
- A new run pushes a snapshot and drops the oldest past 10. The snapshot stores notebook URI, target cell index, first-line preview, time, hop map, and tree. It is not recomputed on select. If cells were inserted later, indexes can be stale until the user runs the command again.

## Wiring

- Command `jupyter-cell-tags.dependencyChain.showDependentCells`, title **Dependency Chain: Show Dependant Cells**, on `notebook/cell/context` when one cell is selected and `notebookType == jupyter-notebook`. The handler no-ops with a message unless the cell is Python code.
- Activate from [`src/extension.ts`](src/extension.ts).
- Add the command id to `activationEvents`.
