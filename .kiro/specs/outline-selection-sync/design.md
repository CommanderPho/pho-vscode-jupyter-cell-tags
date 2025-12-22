# Design Document: Outline Selection Synchronization

## Overview

This design addresses the synchronization between programmatically selected notebook cells and the VS Code Outline pane. Currently, when cells are selected through extension commands like `selectAllChildCells`, the Outline view does not reflect these selections, creating a disconnect between the actual notebook state and its visual representation in the Outline pane.

The solution involves understanding VS Code's Outline view architecture and implementing a mechanism to trigger Outline updates when programmatic selections occur. Since VS Code's Outline view for notebooks is built-in and not directly controllable via extension APIs, we need to explore alternative approaches such as triggering focus events or using undocumented APIs.

## Architecture

### Current State

The extension currently implements:
- `selectAllChildCells` command that programmatically sets `editor.selections`
- Manual cell selection works correctly with Outline synchronization
- Programmatic selection updates the notebook editor but not the Outline view

### Proposed Architecture

The solution will consist of three main components:

1. **Selection Change Detector**: Monitors programmatic selection changes
2. **Outline Synchronization Manager**: Coordinates updates to the Outline view
3. **Focus Manager**: Ensures proper focus handling to trigger Outline updates

```
┌─────────────────────────────────────┐
│  Extension Commands                 │
│  (selectAllChildCells, etc.)        │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Selection Change Detector          │
│  - Monitors editor.selections       │
│  - Detects programmatic changes     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Outline Synchronization Manager    │
│  - Triggers Outline refresh         │
│  - Manages debouncing               │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Focus Manager                       │
│  - Handles editor focus              │
│  - Triggers VS Code Outline update   │
└─────────────────────────────────────┘
```

## Components and Interfaces

### 1. Selection Change Detector

**Purpose**: Track when selections change programmatically

**Interface**:
```typescript
interface ISelectionChangeDetector {
    /**
     * Register a callback to be invoked when selections change
     */
    onSelectionChange(callback: (selections: vscode.NotebookRange[]) => void): vscode.Disposable;
    
    /**
     * Manually trigger a selection change event
     */
    triggerSelectionChange(selections: vscode.NotebookRange[]): void;
}
```

**Implementation Notes**:
- Listen to `vscode.window.onDidChangeNotebookEditorSelection` event
- Track whether changes are programmatic vs manual
- Debounce rapid selection changes (100ms window)

### 2. Outline Synchronization Manager

**Purpose**: Coordinate Outline view updates when selections change

**Interface**:
```typescript
interface IOutlineSyncManager {
    /**
     * Synchronize the Outline view with current selections
     */
    syncOutline(editor: vscode.NotebookEditor): Promise<void>;
    
    /**
     * Enable or disable automatic synchronization
     */
    setEnabled(enabled: boolean): void;
}
```

**Implementation Strategies** (in order of preference):

1. **Focus-based approach**: Temporarily blur and refocus the editor to trigger Outline refresh
2. **Command-based approach**: Execute VS Code commands that refresh the Outline
3. **Event-based approach**: Fire synthetic events that VS Code's Outline listens to

### 3. Focus Manager

**Purpose**: Manage editor focus to trigger Outline updates

**Interface**:
```typescript
interface IFocusManager {
    /**
     * Refresh editor focus to trigger Outline update
     */
    refreshFocus(editor: vscode.NotebookEditor): Promise<void>;
    
    /**
     * Check if editor has focus
     */
    hasFocus(editor: vscode.NotebookEditor): boolean;
}
```

## Data Models

### Selection State

```typescript
interface SelectionState {
    /** The notebook editor */
    editor: vscode.NotebookEditor;
    
    /** Current selections */
    selections: vscode.NotebookRange[];
    
    /** Timestamp of last change */
    timestamp: number;
    
    /** Whether change was programmatic */
    isProgrammatic: boolean;
}
```

### Sync Configuration

```typescript
interface OutlineSyncConfig {
    /** Enable/disable synchronization */
    enabled: boolean;
    
    /** Debounce delay in milliseconds */
    debounceMs: number;
    
    /** Maximum retries for sync attempts */
    maxRetries: number;
    
    /** Retry delay in milliseconds */
    retryDelayMs: number;
}
```

## Correctness Properties


*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

After analyzing the acceptance criteria, several properties emerge as redundant or can be consolidated:

**Redundancy Analysis**:
- Properties 1.2, 1.4, 2.3, and 2.4 all test aspects of selection synchronization and can be consolidated into a single comprehensive property about selection state equivalence
- Properties 4.2 and 4.3 test that various notebook states don't affect synchronization and can be combined
- Property 5.2 is subsumed by the general synchronization property since it applies to all selection changes

**Consolidated Correctness Properties**:

Property 1: Selection state equivalence
*For any* notebook editor and any set of selected cells (whether selected manually or programmatically), the Outline pane SHALL reflect exactly the same selection state as the notebook editor
**Validates: Requirements 1.2, 1.4, 2.3, 2.4, 5.2**

Property 2: Synchronization timing
*For any* programmatic selection change, the Outline pane SHALL synchronize within 100 milliseconds of the selection change
**Validates: Requirements 1.3**

Property 3: Notebook state independence
*For any* notebook state (including cell count, cell types, scroll position), selection synchronization SHALL function correctly without errors
**Validates: Requirements 4.1, 4.2, 4.3**

Property 4: Debouncing behavior
*For any* sequence of rapid selection changes (multiple changes within 100ms), the Outline pane SHALL update at most once per debounce window, displaying the final selection state
**Validates: Requirements 4.4**

## Error Handling

### Error Scenarios

1. **Outline Pane Not Available**
   - Detection: Check if Outline view is registered/visible
   - Handling: Gracefully skip synchronization, log warning
   - Recovery: Retry on next selection change

2. **Focus Management Failure**
   - Detection: Focus commands fail or timeout
   - Handling: Fall back to alternative synchronization method
   - Recovery: Retry with exponential backoff

3. **Selection State Mismatch**
   - Detection: Outline state doesn't match editor state after sync
   - Handling: Retry synchronization up to max retries
   - Recovery: Log error if all retries fail, continue operation

4. **Performance Degradation**
   - Detection: Synchronization takes longer than threshold
   - Handling: Increase debounce delay dynamically
   - Recovery: Reset to default delay after stable period

### Error Handling Strategy

```typescript
async function syncWithRetry(
    editor: vscode.NotebookEditor,
    maxRetries: number = 3
): Promise<boolean> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            await syncOutline(editor);
            return true;
        } catch (error) {
            log(`Sync attempt ${attempt + 1} failed: ${error}`);
            if (attempt < maxRetries - 1) {
                await delay(100 * Math.pow(2, attempt)); // Exponential backoff
            }
        }
    }
    return false;
}
```

## Testing Strategy

### Unit Testing

Unit tests will verify individual components in isolation:

1. **Selection Change Detector Tests**
   - Test that selection changes are detected correctly
   - Test debouncing logic with various timing scenarios
   - Test programmatic vs manual selection differentiation

2. **Outline Sync Manager Tests**
   - Test sync enable/disable functionality
   - Test configuration management
   - Test retry logic with mocked failures

3. **Focus Manager Tests**
   - Test focus state detection
   - Test focus refresh operations
   - Test handling of focus failures

### Property-Based Testing

Property-based tests will use **fast-check** (JavaScript/TypeScript property testing library) to verify correctness properties across many randomly generated inputs. Each property test will run a minimum of 100 iterations.

**Test Configuration**:
```typescript
import * as fc from 'fast-check';

// Configure fast-check to run 100 iterations minimum
const testConfig = { numRuns: 100 };
```

**Property Test Implementations**:

1. **Property 1: Selection State Equivalence**
   ```typescript
   // Feature: outline-selection-sync, Property 1: Selection state equivalence
   fc.assert(
       fc.property(
           fc.array(fc.integer({ min: 0, max: 99 })), // Random cell indices
           async (cellIndices) => {
               // Create selections from indices
               const selections = cellIndices.map(i => 
                   new vscode.NotebookRange(i, i + 1)
               );
               
               // Apply selections programmatically
               editor.selections = selections;
               await syncManager.syncOutline(editor);
               
               // Verify Outline reflects same selections
               const outlineState = await getOutlineSelectionState();
               return areSelectionsEqual(selections, outlineState);
           }
       ),
       testConfig
   );
   ```

2. **Property 2: Synchronization Timing**
   ```typescript
   // Feature: outline-selection-sync, Property 2: Synchronization timing
   fc.assert(
       fc.property(
           fc.array(fc.integer({ min: 0, max: 99 })),
           async (cellIndices) => {
               const selections = cellIndices.map(i => 
                   new vscode.NotebookRange(i, i + 1)
               );
               
               const startTime = Date.now();
               editor.selections = selections;
               await syncManager.syncOutline(editor);
               const endTime = Date.now();
               
               return (endTime - startTime) <= 100;
           }
       ),
       testConfig
   );
   ```

3. **Property 3: Notebook State Independence**
   ```typescript
   // Feature: outline-selection-sync, Property 3: Notebook state independence
   fc.assert(
       fc.property(
           fc.record({
               cellCount: fc.integer({ min: 1, max: 200 }),
               cellTypes: fc.array(fc.constantFrom('code', 'markdown')),
               scrollPosition: fc.integer({ min: 0, max: 100 }),
               selectedIndices: fc.array(fc.integer({ min: 0, max: 199 }))
           }),
           async (notebookState) => {
               // Create notebook with specified state
               const notebook = await createTestNotebook(notebookState);
               const editor = await openNotebook(notebook);
               
               // Apply selections
               const selections = notebookState.selectedIndices.map(i =>
                   new vscode.NotebookRange(i, i + 1)
               );
               editor.selections = selections;
               
               // Attempt synchronization
               try {
                   await syncManager.syncOutline(editor);
                   return true; // Success means no errors
               } catch (error) {
                   return false;
               }
           }
       ),
       testConfig
   );
   ```

4. **Property 4: Debouncing Behavior**
   ```typescript
   // Feature: outline-selection-sync, Property 4: Debouncing behavior
   fc.assert(
       fc.property(
           fc.array(fc.array(fc.integer({ min: 0, max: 99 })), { minLength: 3, maxLength: 10 }),
           async (selectionSequence) => {
               let updateCount = 0;
               const originalSync = syncManager.syncOutline;
               syncManager.syncOutline = async (editor) => {
                   updateCount++;
                   return originalSync.call(syncManager, editor);
               };
               
               // Apply rapid selection changes (within 100ms)
               for (const indices of selectionSequence) {
                   const selections = indices.map(i => 
                       new vscode.NotebookRange(i, i + 1)
                   );
                   editor.selections = selections;
                   await delay(10); // 10ms between changes
               }
               
               // Wait for debounce window
               await delay(150);
               
               // Should have updated at most once per debounce window
               const expectedMaxUpdates = Math.ceil(
                   (selectionSequence.length * 10) / 100
               );
               return updateCount <= expectedMaxUpdates;
           }
       ),
       testConfig
   );
   ```

### Integration Testing

Integration tests will verify the complete flow:

1. Test `selectAllChildCells` command triggers Outline sync
2. Test multiple commands in sequence maintain sync
3. Test sync works with real VS Code Outline view
4. Test extension activation/deactivation lifecycle

### Manual Testing Checklist

Since the Outline view is a UI component, some manual verification is needed:

- [ ] Verify Outline highlights match selected cells visually
- [ ] Verify highlighting style is consistent with manual selection
- [ ] Verify Outline scrolls to show selected cells when needed
- [ ] Verify no flickering occurs during rapid selections
- [ ] Verify behavior with Outline view hidden/shown

## Implementation Notes

### VS Code API Limitations

The VS Code extension API does not provide direct control over the Outline view. The Outline view is populated by DocumentSymbolProviders, and for notebooks, VS Code has a built-in provider. We cannot directly manipulate the Outline's selection state.

### Workaround Approaches

1. **Focus-based Trigger** (Primary approach)
   - Temporarily remove and restore focus to the editor
   - This triggers VS Code's internal Outline update mechanism
   - Implementation: Use `vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup')`

2. **Command-based Trigger** (Fallback)
   - Execute commands that refresh the Outline
   - Potential commands: `outline.focus`, `workbench.action.focusOutline`
   - May not work reliably across VS Code versions

3. **Event-based Trigger** (Last resort)
   - Fire synthetic selection change events
   - Requires deeper investigation of VS Code internals
   - May be fragile across updates

### Performance Considerations

- Debounce selection changes to avoid excessive Outline updates
- Use requestAnimationFrame for UI-related operations
- Cache Outline state to avoid redundant updates
- Monitor performance metrics and adjust debounce delay dynamically

### Compatibility

- Target VS Code API version: ^1.98.0 (current extension requirement)
- Test across VS Code versions: 1.98.x, 1.99.x, 1.100.x
- Ensure graceful degradation if Outline API changes

## Dependencies

### New Dependencies

- **fast-check**: Property-based testing library for TypeScript
  - Version: ^3.15.0
  - Purpose: Generate random test inputs for property tests
  - Installation: `npm install --save-dev fast-check @types/fast-check`

### Existing Dependencies

- VS Code Extension API (^1.98.0)
- TypeScript (^5.8.3)
- @vscode/test-electron (for integration tests)

## Migration Strategy

This is a new feature with no migration needed. The implementation will:

1. Add new modules without modifying existing code initially
2. Integrate with existing `selectAllChildCells` command
3. Extend to other selection-modifying commands incrementally
4. Provide configuration option to disable if issues arise

## Configuration

Add new configuration options to `package.json`:

```json
{
  "configuration": {
    "properties": {
      "jupyter-cell-tags.outlineSync.enabled": {
        "type": "boolean",
        "default": true,
        "description": "Enable automatic Outline pane synchronization with programmatic cell selections"
      },
      "jupyter-cell-tags.outlineSync.debounceMs": {
        "type": "number",
        "default": 100,
        "description": "Debounce delay in milliseconds for Outline synchronization"
      }
    }
  }
}
```

## Future Enhancements

1. **Bidirectional Sync**: Allow Outline selections to update notebook editor
2. **Smart Scrolling**: Automatically scroll Outline to show selected cells
3. **Visual Feedback**: Add temporary highlighting when sync occurs
4. **Performance Monitoring**: Track and report sync performance metrics
5. **Adaptive Debouncing**: Automatically adjust debounce based on notebook size
