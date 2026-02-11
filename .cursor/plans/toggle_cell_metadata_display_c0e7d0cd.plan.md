---
name: Toggle Cell Metadata Display
overview: Add a command to toggle a webview panel that displays the active cell's metadata in a formatted JSON view for debugging purposes. The panel will update automatically when the active cell changes.
todos: []
---

# Add Toggle Cell Metadata Display Command

## Overview

Add a new command `jupyter-cell-tags.toggleCellMetadataDisplay` that opens/closes a webview panel showing the active cell's metadata in a formatted, syntax-highlighted JSON view. The panel will automatically update when the active cell changes.

## Implementation

### 1. Create new module for cell metadata display

Create [`src/cellMetadataDisplay/cellMetadataDisplay.ts`](src/cellMetadataDisplay/cellMetadataDisplay.ts):

- Export a function to register the toggle command
- Manage webview panel lifecycle (create, update, dispose)
- Format cell metadata as JSON with syntax highlighting
- Listen to cell selection changes and update the webview when active cell changes
- Store webview panel reference in extension context

### 2. Register command in package.json

Add command definition in [`package.json`](package.json):

- Command ID: `jupyter-cell-tags.toggleCellMetadataDisplay`
- Title: `🔍 Toggle Cell Metadata Display`
- Category: `Jupyter Cell Tags`
- Add to command palette menu

### 3. Register command in extension activation

In [`src/extension.ts`](src/extension.ts):

- Import and call the registration function from the new module
- Add to the activation sequence

### 4. Webview implementation details

- Use VS Code's webview API to create a panel
- Display formatted JSON with proper indentation
- Include cell index, cell type, and full metadata object
- Show a message when no cell is selected
- Auto-update when `onDidChangeNotebookEditorSelection` fires
- Handle panel disposal when toggled off or closed

### 5. State management

- Track whether the panel is currently visible
- Reuse existing panel if already open (toggle behavior)
- Clean up event listeners on disposal