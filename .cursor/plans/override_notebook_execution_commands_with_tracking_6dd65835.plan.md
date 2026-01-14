---
name: Override notebook execution commands with tracking
overview: Implement two new commands that override the default notebook execution commands (shift+enter and ctrl+enter) to capture execution start time and cell order, then forward to the original commands. Execution data will be stored in extension global state for future features.
todos:
  - id: update-cell-execution-tracking
    content: Update cellExecutionTracking.ts to add execution data storage functions and two new command handlers that capture execution time and forward to original commands
    status: completed
  - id: update-package-json-commands
    content: Add two new command definitions to package.json contributes.commands section
    status: completed
  - id: update-package-json-keybindings
    content: Override shift+enter and ctrl+enter keybindings in package.json to point to new tracking commands
    status: completed
    dependencies:
      - update-package-json-commands
  - id: verify-extension-registration
    content: Verify that registerCommands from cellExecutionTracking is properly called in extension.ts
    status: completed
    dependencies:
      - update-cell-execution-tracking
---

# Override Notebook Execution Commands with Execution Tracking

## Overview

Create two new commands that intercept the default notebook cell execution commands (`notebook.cell.executeAndSelectBelow` and `notebook.cell.executeAndFocusContainer`) to capture execution datetime and cell order before forwarding to the original commands.

## Implementation Details

### 1. Update `src/cellExecution/cellExecutionTracking.ts`

   - Add execution data storage structure (Map keyed by notebook URI)
   - Add functions to:
     - `recordCellExecution(notebookUri: vscode.Uri, cellIndex: number, executionTime: Date)`: Store execution data
     - `getExecutionHistory(notebookUri: vscode.Uri)`: Retrieve execution history for a notebook
   - Create two new command handlers:
     - `executeAndSelectBelowWithTracking()`: Captures execution time, gets active cell, records execution, then calls `notebook.cell.executeAndSelectBelow`
     - `executeAndFocusContainerWithTracking()`: Same pattern for `notebook.cell.executeAndFocusContainer`
   - Use `context.globalState` to persist execution data across VS Code restarts

### 2. Update `package.json`

   - Add two new command definitions in the `contributes.commands` section:
     - `jupyter-cell-tags.executeAndSelectBelowWithTracking`
     - `jupyter-cell-tags.executeAndFocusContainerWithTracking`
   - Override keybindings in `contributes.keybindings`:
     - Replace `shift+enter` binding to point to `jupyter-cell-tags.executeAndSelectBelowWithTracking` with the same `when` clause
     - Replace `ctrl+enter` binding to point to `jupyter-cell-tags.executeAndFocusContainerWithTracking` with the same `when` clause

### 3. Update `src/extension.ts`

   - Import and call `registerCommands` from `cellExecution/cellExecutionTracking` (already imported but verify it's called)
   - Ensure the execution tracking commands are registered during activation

## Data Structure

Store execution data as:

```typescript
{
  notebookUri: string -> {
    executions: Array<{
      cellIndex: number,
      executionTime: string (ISO date),
      executionOrder: number
    }>
  }
}
```

## Key Considerations

- Get active cell using `getActiveCell()` from `src/util/notebookSelection.ts`
- Handle cases where no active notebook editor exists
- Store execution order as a sequential counter per notebook
- Use `vscode.commands.executeCommand()` to forward to original commands
- Preserve all original command behavior (selection, focus, etc.)