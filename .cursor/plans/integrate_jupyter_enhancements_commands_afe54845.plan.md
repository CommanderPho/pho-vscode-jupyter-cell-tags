---
name: Integrate Jupyter Enhancements Commands
overview: Copy all commands and functionality from the jupyter-enhancements extension into vscode-jupyter-cell-tags, placing the code in a new `jupyterEnhancements` subfolder within `src`, following the same modular pattern used for `ringMeJupyter`.
todos: []
---

# Integrate Jupyter Enhancements Commands

## Overview

Copy all commands and functionality from `jupyter-enhancements` extension into `vscode-jupyter-cell-tags`, organizing the code in a new `src/jupyterEnhancements` subfolder following the modular pattern established by `ringMeJupyter`.

## Commands to Integrate

From `jupyter-enhancements`, there are two main commands:

1. `jupyter-enhancements.execute` - Run Current & Below
2. `jupyter-enhancements.runInScratchpad` - Run Selection in Scratchpad

The extension also hijacks several native commands to add visual decorations:

- `notebook.cell.executeCellAndBelow`
- `notebook.cell.executeCellsAbove`
- `jupyter.runCellAndAllBelow`
- `jupyter.runPrecedentCells`
- `jupyter.runDependentCells`
- `notebook.cell.execute` (hijacked)
- `notebook.execute` (hijacked)

## Implementation Steps

### 1. Create Module Structure

- Create `src/jupyterEnhancements/` directory
- Create `src/jupyterEnhancements/startup.ts` - main activation function
- Copy and adapt `extension.ts` from jupyter-enhancements to `src/jupyterEnhancements/extension.ts`

### 2. Update Command IDs

Following the naming convention pattern (like `ringMeJupyter`), update all command IDs:

- `jupyter-enhancements.execute` → `jupyter-cell-tags.jupyterEnhancements.execute`
- `jupyter-enhancements.runInScratchpad` → `jupyter-cell-tags.jupyterEnhancements.runInScratchpad`

### 3. Update Configuration Properties

Update all configuration property names in the code:

- `jupyterEnhancements.*` → `jupyter-cell-tags.jupyterEnhancements.*`

This affects:

- `jupyterEnhancements.layout.enableCompactView`
- `jupyterEnhancements.kernel.optimizeStartup`
- `jupyterEnhancements.kernel.pythonPath`
- `jupyterEnhancements.layout.hideCellToolbar`
- `jupyterEnhancements.general.flashDuration`
- `jupyterEnhancements.background.*`
- `jupyterEnhancements.flash.*`
- `jupyterEnhancements.innerBorder.*`
- `jupyterEnhancements.outerBorder.*`
- `jupyterEnhancements.scratchpad.*`

### 4. Update package.json

Add to `package.json`:

- **Commands**: Add the two main commands with updated IDs
- **Keybindings**: Add F11 keybinding for scratchpad command
- **Menus**: Add menu entries for notebook toolbar, cell title, and context menus
- **Configuration**: Add all configuration properties with updated names
- **Activation Events**: Add activation events for notebook execution commands

### 5. Register in Main Extension

- Import and call `activateJupyterEnhancements(context)` in `src/extension.ts` (similar to `activateRingMeJupyter`)

### 6. Code Adaptations

- Update all `vscode.workspace.getConfiguration('jupyterEnhancements')` calls to use `'jupyter-cell-tags.jupyterEnhancements'`
- Ensure output channel name is appropriate (or reuse existing logging)
- Maintain all visual decoration logic (backgrounds, borders, flash effects, scratchpad styling)
- Preserve all hijack functionality for native commands

## Files to Create/Modify

### New Files

- `src/jupyterEnhancements/startup.ts` - Activation function
- `src/jupyterEnhancements/extension.ts` - Main functionality (adapted from jupyter-enhancements)

### Files to Modify

- `src/extension.ts` - Add activation call
- `package.json` - Add commands, keybindings, menus, configuration, activation events

## Configuration Properties to Add

All configuration properties from jupyter-enhancements need to be added with the `jupyter-cell-tags.jupyterEnhancements` prefix, including:

- Layout settings (compact view, hide toolbar)
- Kernel settings (optimize startup, python path)
- Visual decorations (background, flash, inner border, outer border)
- Scratchpad settings (border color, style, width, background)

## Notes

- The jupyter-enhancements extension is essentially a single large file, so most functionality will be in `extension.ts`
- Command hijacking is used to intercept native notebook execution commands
- Visual decorations are applied using VS Code's decoration API
- The extension modifies VS Code settings for layout configuration