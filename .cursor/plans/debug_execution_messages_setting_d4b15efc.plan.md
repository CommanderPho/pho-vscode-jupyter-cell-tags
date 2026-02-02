---
name: Debug execution messages setting
overview: Add a workspace setting to toggle display of debug execution/navigation message boxes (e.g. "Navigated to cell 556", "Executed cell X"). When disabled (default), no message boxes are shown; when enabled, they appear for extension debugging. Optionally fix the "[object Object]1" bug when the Run Cell command receives a tree item instead of a number.
todos: []
isProject: false
---

# Add setting for debug execution message boxes

## Current behavior

- **"Navigated to cell X"** is shown via `[showTimedInformationMessage](src/util/logging.ts)` in `[allNotebookTagsTreeDataProvider.ts](src/noteAllTags/allNotebookTagsTreeDataProvider.ts)` (line 333) when opening a cell from the All Notebook Tags view.
- **"Executed cell X"** is shown in the same file (line 408) after running a cell via the "Run Cell" command.

Both calls use the shared helper in `[src/util/logging.ts](src/util/logging.ts)` (`showTimedInformationMessage`), which calls `vscode.window.showInformationMessage`. There is no setting to disable these; they always show.

The **"[object Object]1"** text occurs when the Run Cell command is invoked from the tree view: VS Code passes the tree item (`CellTreeItem`) as the first argument, but the handler is typed as `(cellIndex: number)`. The code then does `cellIndex + 1`, which string-coerces the object to `"[object Object]1"`. The open-notebook command does not have this issue because the tree item explicitly sets `arguments: [element.index]`; the execute-run-cell menu contribution does not pass arguments, so the view item is passed instead.

## Implementation

### 1. Add the setting in package.json

In the existing **Jupyter Cell Tags** configuration block (`[package.json](package.json)` lines 61–128), add a new boolean property after `jupyter-cell-tags.debugPrint` (or nearby):

- **Key:** `jupyter-cell-tags.showDebugExecutionMessages`
- **Type:** `boolean`
- **Default:** `false` (no message boxes for end users)
- **Description:** e.g. "Show debug message boxes for cell navigation and execution (e.g. 'Navigated to cell X', 'Executed cell X'). Useful for extension debugging; leave disabled for normal use."

### 2. Gate the two message-box calls in allNotebookTagsTreeDataProvider.ts

- **Import:** Ensure the file can read the setting (e.g. `vscode.workspace.getConfiguration('jupyter-cell-tags').get<boolean>('showDebugExecutionMessages', false)`).
- **Navigate (line ~333):** Before calling `showTimedInformationMessage('Navigated to cell ...', 1500)`, check the setting; only call it when `showDebugExecutionMessages` is true.
- **Execute (line ~408):** Same check before `showTimedInformationMessage('Executed cell ...', 3000)`.

No changes are needed in `logging.ts`; the gate is at the call site so only these two debug messages are affected and the rest of the extension’s use of `showTimedInformationMessage` / `showInformationMessage` is unchanged.

### 3. (Optional) Fix "[object Object]1" when Run Cell is invoked from the view

In the **executeRunCell** handler in `[allNotebookTagsTreeDataProvider.ts](src/noteAllTags/allNotebookTagsTreeDataProvider.ts)` (and, for consistency, **openNotebookCell** if it can ever receive a tree item):

- Treat the first parameter as either a `number` (cell index) or a tree item (e.g. object with `cellRef?: { index: number }`).
- Normalize to a number at the start of the handler, e.g.  
`const cellIndex = typeof cellIndexOrItem === 'number' ? cellIndexOrItem : (cellIndexOrItem?.cellRef?.index ?? -1);`  
(adjust property names to match `CellTreeItem` / `CellReference`: `cellRef.index`).
- If the resolved index is invalid (e.g. &lt; 0), show an error and return.

This ensures the correct cell index is used and the message (when enabled) shows a number, e.g. "Executed cell 1", instead of "[object Object]1".

## Files to touch


| File                                                                                                       | Change                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[package.json](package.json)`                                                                             | Add `jupyter-cell-tags.showDebugExecutionMessages` under `configuration.properties`.                                                                                                     |
| `[src/noteAllTags/allNotebookTagsTreeDataProvider.ts](src/noteAllTags/allNotebookTagsTreeDataProvider.ts)` | Read setting and conditionally call `showTimedInformationMessage` for navigate (L333) and execute (L408); optionally normalize `executeRunCell`/`openNotebookCell` argument to a number. |


## Summary

- New setting: **off by default** so end users do not see the messages.
- When enabled, the same two messages appear as today (and show correct cell numbers if the optional argument fix is applied).

