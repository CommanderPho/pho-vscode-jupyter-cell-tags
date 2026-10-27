---
name: Always register execute wrappers
overview: Always register cell-execution-tracking commands so Shift+Enter/Ctrl+Enter never hit a missing handler. When the feature is off, the execute wrappers skip recording and forward to the built-in notebook commands; other tracking commands no-op and tracking UI stays gated.
todos:
  - id: always-forward-wrappers
    content: "Always-register execute wrappers: record only when tracking is on, always forward to built-in notebook execute commands"
    status: completed
  - id: noop-other-commands
    content: No-op list/tag/navigate tracking commands when the feature is off
    status: completed
  - id: split-activation
    content: Call registerCommands unconditionally; keep listener + executed-cells view behind the feature flag
    status: completed
  - id: hide-ui-when-off
    content: Gate executed-cells view and tracking menus on the feature config when clause
    status: completed
  - id: align-default
    content: Align FEATURE_DEFAULTS.cellExecutionTracking with package.json default true
    status: completed
isProject: false
---

# Always register tracking commands; forward execute when off

Shift+Enter and Ctrl+Enter are always bound in [`package.json`](package.json) to `jupyter-cell-tags.executeAndSelectBelowWithTracking` / `executeAndFocusContainerWithTracking`, but handlers are only registered inside the `features.cellExecutionTracking` gate in [`src/extension.ts`](src/extension.ts). That produces `command not found` when the extension is active and the setting is off.

Keep the keybindings as they are (no feature `when` clause). Always register the command handlers. When tracking is off, execute wrappers still run the built-in notebook commands; the rest of tracking is a no-op and its UI stays hidden.

```mermaid
flowchart TD
  key [ShiftEnter_or_CtrlEnter] --> wrapper [AlwaysRegisteredWrapper]
  wrapper --> flag{cellExecutionTracking?}
  flag -->|on| record [recordCellExecution]
  record --> builtin [notebook.cell.executeAndSelectBelow_or_FocusContainer]
  flag -->|off| builtin
```

## Command behavior

In [`src/cellExecution/cellExecutionTracking.ts`](src/cellExecution/cellExecutionTracking.ts):

- **Execute wrappers** (`executeAndSelectBelowWithTracking`, `executeAndFocusContainerWithTracking`): if `isFeatureEnabled('cellExecutionTracking')` and there is an active cell, record as today; **always** `executeCommand` the matching built-in (`notebook.cell.executeAndSelectBelow` / `notebook.cell.executeAndFocusContainer`). Do not return early without forwarding — that currently swallows Shift+Enter when no cell is resolved.
- **Other tracking commands** (`listExecutedNotebookCells`, `createAndAddTagToAllExecutedCells`, `navigateToPreviousExecutedCell`, `navigateToNextExecutedCell`): if the feature is off, return immediately (silent no-op).

## Registration split

Today [`activateNotebookCellExecutionTracking`](src/cellExecution/startup.ts) both registers commands and starts recording UI. Split so commands cannot go missing:

- Always call `registerCommands(context)` from [`src/extension.ts`](src/extension.ts) (unconditional).
- Keep `if (isFeatureEnabled('cellExecutionTracking')) { activateNotebookCellExecutionTracking(context); }` for the notebook-document listener and `registerExecutedCellsView` only.
- Remove `registerCommands(context)` from `activateNotebookCellExecutionTracking` so the handlers are not double-registered.

`jupyter-cell-tags.executedCells.selectCell` stays with the tree view (not a contributed palette command).

## Hide tracking UI when off

In [`package.json`](package.json), add the same feature `when` used by other optional views:

- `executed-cells-view`: `jupyter-cell-tags.notebookActive && config.jupyter-cell-tags.features.cellExecutionTracking`
- Existing menus that expose `listExecutedNotebookCells` (and any sibling tracking actions): add `config.jupyter-cell-tags.features.cellExecutionTracking` so they do not appear when off

Do not add that `when` to the Shift+Enter / Ctrl+Enter keybindings.

## Small default alignment

Set `cellExecutionTracking: true` in [`src/util/featureFlags.ts`](src/util/featureFlags.ts) `FEATURE_DEFAULTS` so the fallback matches the contributed default in `package.json`.
