# Component Reuse Strategy

This document outlines how the custom-notebook-outline feature will reuse components from the existing outline-selection-sync feature.

## Overview

The custom-notebook-outline feature builds upon the foundation established by outline-selection-sync. Rather than duplicating code, we will reuse key components and extend them where necessary.

## Components to Reuse

### 1. OutlineSyncManager (from outline-selection-sync)

**Location**: `src/outlineSync/OutlineSyncManager.ts`

**What it does**:
- Synchronizes the VS Code built-in Outline pane with notebook cell selections
- Uses focus-based approach to trigger outline updates
- Implements retry logic with exponential backoff
- Manages configuration for sync behavior

**How we'll reuse it**:
- The custom outline view will use the same synchronization mechanism
- When cells are selected in the editor, OutlineSyncManager will help update both:
  - The built-in VS Code Outline (existing behavior)
  - The custom outline tree view (new behavior)
- Configuration will be shared between both features

**Integration point**:
```typescript
// In custom outline view
const syncManager = new OutlineSyncManager(config);

// When editor selection changes
await syncManager.syncOutline(editor);

// This will trigger the built-in outline update
// We'll also update our custom tree view in parallel
```

### 2. SelectionChangeDetector (from outline-selection-sync)

**Location**: `src/outlineSync/SelectionChangeDetector.ts`

**What it does**:
- Detects when notebook cell selections change
- Distinguishes between programmatic and manual selection changes
- Implements debouncing to prevent excessive updates
- Provides callbacks for selection change events

**How we'll reuse it**:
- The custom outline view will register a callback with SelectionChangeDetector
- When selections change (from any source), we'll update the custom outline view
- Debouncing logic will prevent flickering during rapid changes

**Integration point**:
```typescript
// In custom outline view registration
const selectionDetector = new SelectionChangeDetector(config.debounceMs);

selectionDetector.onSelectionChange(async (editor, selections) => {
    // Update custom outline view to highlight selected items
    await customOutlineProvider.syncEditorToOutline(editor, selections);
});
```

### 3. Configuration System

**Location**: `package.json` and `src/outlineSync/startup.ts`

**What it does**:
- Reads configuration from VS Code settings
- Listens for configuration changes
- Updates components when configuration changes

**How we'll reuse it**:
- Extend existing configuration with custom outline settings
- Share debounce delay configuration between features
- Use same pattern for hot-reloading configuration

**Configuration structure**:
```json
{
  "jupyter-cell-tags.outlineSync.enabled": true,
  "jupyter-cell-tags.outlineSync.debounceMs": 300,
  "jupyter-cell-tags.customOutline.enabled": true,
  "jupyter-cell-tags.customOutline.updateDebounceMs": 200,
  "jupyter-cell-tags.customOutline.showCellIndices": false
}
```

## New Components (Not Reused)

These components are specific to the custom outline view and cannot be reused:

### 1. HeadingParser
- Parses markdown headings from cells
- Determines heading hierarchy
- Calculates child cell ranges

### 2. NotebookOutlineTreeDataProvider
- Implements VS Code TreeDataProvider interface
- Provides tree structure for custom outline view
- Handles multi-select

### 3. OutlineItem Model
- Represents outline items in the tree view
- Extends vscode.TreeItem

### 4. UpdateCoordinator
- Manages outline updates with debouncing
- Checks view visibility
- Coordinates refresh operations

## Integration Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Extension Activation (extension.ts)                        │
└───────────────┬─────────────────────────────────────────────┘
                │
                ├─────────────────────────────────────────────┐
                │                                             │
                ▼                                             ▼
┌───────────────────────────────┐     ┌──────────────────────────────────┐
│  outline-selection-sync       │     │  custom-notebook-outline         │
│  (Existing Feature)           │     │  (New Feature)                   │
├───────────────────────────────┤     ├──────────────────────────────────┤
│  - OutlineSyncManager         │◄────┤  - Reuses OutlineSyncManager     │
│  - SelectionChangeDetector    │◄────┤  - Reuses SelectionChangeDetector│
│  - Configuration              │◄────┤  - Extends Configuration         │
└───────────────────────────────┘     │  - HeadingParser (new)           │
                                      │  - TreeDataProvider (new)        │
                                      │  - UpdateCoordinator (new)       │
                                      └──────────────────────────────────┘
```

## Shared vs. Separate Instances

### Shared Instances
- **SelectionChangeDetector**: Single instance shared by both features
  - Registered once in extension activation
  - Both features register callbacks with the same detector
  - Ensures consistent debouncing across features

- **OutlineSyncManager**: Single instance shared by both features
  - Registered once in extension activation
  - Both features call syncOutline() when needed
  - Ensures consistent synchronization behavior

### Separate Instances
- **TreeDataProvider**: Custom outline has its own provider
  - Built-in outline uses VS Code's internal provider
  - Custom outline uses NotebookOutlineTreeDataProvider

- **UpdateCoordinator**: Custom outline has its own coordinator
  - Manages updates specific to the custom tree view
  - Independent from built-in outline update logic

## Benefits of This Approach

1. **Code Reuse**: Avoid duplicating synchronization logic
2. **Consistency**: Both features use the same sync mechanism
3. **Maintainability**: Bug fixes in shared components benefit both features
4. **Performance**: Single SelectionChangeDetector reduces event listener overhead
5. **Configuration**: Shared settings provide consistent user experience

## Implementation Order

To maximize reuse, implement in this order:

1. **First**: Ensure outline-selection-sync is fully working
   - OutlineSyncManager implemented ✓
   - SelectionChangeDetector implemented ✓
   - Configuration system in place ✓

2. **Second**: Build custom outline components
   - HeadingParser (new)
   - OutlineItem model (new)
   - NotebookOutlineTreeDataProvider (new)

3. **Third**: Integrate with shared components
   - Register callback with SelectionChangeDetector
   - Call OutlineSyncManager.syncOutline() when needed
   - Extend configuration system

4. **Fourth**: Test integration
   - Verify both features work independently
   - Verify both features work together
   - Verify no conflicts or interference

## Testing Strategy

### Unit Tests
- Test new components in isolation
- Mock shared components (OutlineSyncManager, SelectionChangeDetector)

### Integration Tests
- Test custom outline with real shared components
- Verify both features work together
- Test configuration changes affect both features

### Property-Based Tests
- Test synchronization properties across both features
- Verify consistency between built-in and custom outline
