# Design Document: Custom Notebook Outline View

## Overview

This design implements a custom Outline view for Jupyter notebooks that supports multi-selection of cells. The default VS Code Outline view for notebooks does not support multi-select functionality, limiting users' ability to perform bulk operations on multiple cells through the outline interface.

The custom implementation will provide a tree view that mirrors the notebook structure based on markdown headings while enabling multi-select capabilities. Users will be able to select multiple cells from the outline and perform actions on them, with bidirectional synchronization between the outline view and the notebook editor.

A key design principle is to reuse existing components from the outline-selection-sync feature, particularly the OutlineSyncManager and SelectionChangeDetector, to maintain consistency and reduce code duplication.

## Architecture

### Current State

The extension currently has:
- Built-in VS Code Outline view (no multi-select support)
- `outline-selection-sync` feature with OutlineSyncManager and SelectionChangeDetector
- Tree view providers for tags (`AllTagsTreeDataProvider`) and jumpbacks (`JumpbackTreeDataProvider`)
- Cell selection utilities in `util/notebookSelection.ts`

### Proposed Architecture

The solution will consist of five main components:

1. **Notebook Outline Tree Data Provider**: Provides tree structure based on markdown headings
2. **Heading Parser**: Extracts and parses markdown headings from cells
3. **Outline Item Model**: Represents outline items with heading information
4. **Selection Synchronization Manager**: Coordinates bidirectional sync (reuses OutlineSyncManager)
5. **Update Coordinator**: Manages outline updates and debouncing

```
┌─────────────────────────────────────┐
│  VS Code Tree View                  │
│  (Custom Notebook Outline)          │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  NotebookOutlineTreeDataProvider    │
│  - Provides tree structure          │
│  - Handles multi-select             │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  HeadingParser                      │
│  - Extracts markdown headings       │
│  - Determines hierarchy             │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  OutlineItem Model                  │
│  - Heading text, level, cell index  │
│  - Child cell ranges                │
└─────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  SelectionChangeDetector (reused)   │
│  - Detects editor selection changes │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  OutlineSyncManager (reused)        │
│  - Synchronizes selections          │
└─────────────────────────────────────┘
```

## Components and Interfaces

### 1. Notebook Outline Tree Data Provider

**Purpose**: Provide tree structure for the custom outline view

**Interface**:
```typescript
interface INotebookOutlineTreeDataProvider extends vscode.TreeDataProvider<OutlineItem> {
    /**
     * Refresh the outline view
     */
    refresh(): void;
    
    /**
     * Get outline items for the active notebook
     */
    getOutlineItems(): OutlineItem[];
    
    /**
     * Select outline items corresponding to cell indices
     */
    selectItems(cellIndices: number[]): void;
}
```

**Implementation Notes**:
- Extends `vscode.TreeDataProvider<OutlineItem>`
- Listens to notebook document changes to trigger refresh
- Supports multi-select through VS Code's tree view API
- Reuses patterns from `AllTagsTreeDataProvider`

### 2. Heading Parser

**Purpose**: Extract and parse markdown headings from notebook cells

**Interface**:
```typescript
interface IHeadingParser {
    /**
     * Parse headings from a markdown cell
     * @returns Array of headings with text and level
     */
    parseHeadings(cell: vscode.NotebookCell): Heading[];
    
    /**
     * Extract all headings from a notebook
     */
    extractNotebookHeadings(notebook: vscode.NotebookDocument): OutlineItem[];
    
    /**
     * Determine the cell range for a heading (heading cell through cells before next heading)
     */
    getHeadingCellRange(headingIndex: number, headings: OutlineItem[]): vscode.NotebookRange;
}
```

**Data Model**:
```typescript
interface Heading {
    text: string;
    level: number; // 1-6 for # through ######
    lineNumber: number; // Line within the cell
}
```

**Implementation Notes**:
- Use regex to match markdown heading syntax: `/^(#{1,6})\s+(.+)$/`
- Handle multiple headings per cell
- Gracefully handle malformed headings
- Skip non-markdown cells

### 3. Outline Item Model

**Purpose**: Represent an outline item with heading and cell information

**Interface**:
```typescript
class OutlineItem extends vscode.TreeItem {
    constructor(
        public readonly heading: Heading,
        public readonly cellIndex: number,
        public readonly childCellRange: vscode.NotebookRange,
        collapsibleState: vscode.TreeItemCollapsibleState
    );
}
```

**Properties**:
- `heading`: The heading information (text, level)
- `cellIndex`: Index of the cell containing the heading
- `childCellRange`: Range of cells under this heading
- `collapsibleState`: Whether the item can be expanded/collapsed
- `command`: Command to execute when clicked (navigate to cell)
- `contextValue`: For context menu items

### 4. Selection Synchronization Manager

**Purpose**: Coordinate bidirectional selection synchronization

**Implementation**:
- **Reuse** `OutlineSyncManager` from outline-selection-sync feature
- **Reuse** `SelectionChangeDetector` from outline-selection-sync feature
- Add outline-to-editor synchronization logic
- Handle multi-select scenarios

**New Interface**:
```typescript
interface IOutlineSelectionSync {
    /**
     * Sync editor selections to outline view
     */
    syncEditorToOutline(editor: vscode.NotebookEditor, outlineItems: OutlineItem[]): void;
    
    /**
     * Sync outline selections to editor
     */
    syncOutlineToEditor(selectedItems: OutlineItem[]): Promise<void>;
}
```

### 5. Update Coordinator

**Purpose**: Manage outline updates with debouncing

**Interface**:
```typescript
interface IUpdateCoordinator {
    /**
     * Schedule an outline update
     */
    scheduleUpdate(): void;
    
    /**
     * Cancel pending updates
     */
    cancelPendingUpdates(): void;
    
    /**
     * Check if view is visible
     */
    isViewVisible(): boolean;
}
```

**Implementation Notes**:
- Debounce updates using configurable delay (default 200ms)
- Skip updates when view is not visible
- Use `vscode.window.onDidChangeActiveNotebookEditor` to detect notebook switches
- Use `vscode.workspace.onDidChangeNotebookDocument` to detect content changes

## Data Models

### Outline Structure

```typescript
interface OutlineStructure {
    /** Flat list of all outline items */
    items: OutlineItem[];
    
    /** Map from cell index to outline items */
    cellToItems: Map<number, OutlineItem[]>;
    
    /** Map from outline item to child cell range */
    itemToRange: Map<OutlineItem, vscode.NotebookRange>;
}
```

### Selection State

```typescript
interface OutlineSelectionState {
    /** Currently selected outline items */
    selectedItems: OutlineItem[];
    
    /** Corresponding cell indices */
    selectedCellIndices: number[];
    
    /** Whether selection originated from outline or editor */
    source: 'outline' | 'editor';
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing the acceptance criteria, several properties can be consolidated:

**Redundancy Analysis**:
- Properties 3.1, 3.2, and 3.3 all test editor-to-outline synchronization and can be combined into one comprehensive property
- Properties 4.2, 4.3, and 4.4 all test child cell selection logic and can be combined
- Property 5.5 is an optimization check that doesn't affect correctness

**Consolidated Correctness Properties**:

Property 1: Outline structure reflects notebook headings
*For any* notebook with markdown cells, the outline view SHALL display all markdown headings in hierarchical order based on heading levels
**Validates: Requirements 1.1, 1.2, 5.1**

Property 2: Outline updates within time bound
*For any* notebook structure change, the outline view SHALL update within 200 milliseconds
**Validates: Requirements 1.3**

Property 3: Notebook switching updates outline
*For any* notebook switch, the outline view SHALL update to display the active notebook's structure
**Validates: Requirements 1.5**

Property 4: Outline-to-editor synchronization
*For any* set of selected outline items, the notebook editor SHALL select all cells corresponding to those outline items
**Validates: Requirements 2.1, 2.4**

Property 5: Editor-to-outline synchronization
*For any* set of selected cells in the notebook editor (whether selected manually or programmatically), the outline view SHALL highlight all corresponding outline items
**Validates: Requirements 3.1, 3.2, 3.3**

Property 6: Synchronization timing
*For any* notebook editor selection change, the outline view SHALL synchronize within 100 milliseconds
**Validates: Requirements 3.4**

Property 7: Bidirectional synchronization consistency
*For any* selection change in either the outline or editor, the other SHALL reflect the same selection state
**Validates: Requirements 3.5**

Property 8: Child cell selection correctness
*For any* heading in the outline, selecting "Select All Child Cells" SHALL select all cells from the heading cell through the cell before the next heading of equal or higher level (or end of notebook)
**Validates: Requirements 4.2, 4.3, 4.4**

Property 9: Malformed heading handling
*For any* markdown cell with malformed heading syntax, the system SHALL either parse it successfully or skip it without crashing
**Validates: Requirements 5.2**

Property 10: Large notebook performance
*For any* notebook with more than 200 cells, the outline view SHALL render within 500 milliseconds
**Validates: Requirements 5.3**

Property 11: Debouncing behavior
*For any* sequence of rapid notebook edits (multiple changes within 200ms), the outline view SHALL update at most once per debounce window
**Validates: Requirements 5.4**

Property 12: Feature integration compatibility
*For any* operation in the custom outline view, the outline-selection-sync feature SHALL continue to function correctly
**Validates: Requirements 6.4**

Property 13: Configuration hot-reload
*For any* configuration change, the outline view SHALL apply the new configuration without requiring an extension restart
**Validates: Requirements 7.2, 7.3, 7.4**

## Error Handling

### Error Scenarios

1. **Heading Parsing Failure**
   - Detection: Regex match fails or throws exception
   - Handling: Log warning, skip the malformed heading
   - Recovery: Continue parsing remaining headings

2. **Empty Outline**
   - Detection: No markdown headings found in notebook
   - Handling: Display message "No outline available"
   - Recovery: Monitor for new headings being added

3. **Synchronization Failure**
   - Detection: OutlineSyncManager throws error
   - Handling: Log error, continue operation
   - Recovery: Retry on next selection change

4. **Performance Degradation**
   - Detection: Update takes longer than threshold
   - Handling: Increase debounce delay dynamically
   - Recovery: Reset to default after stable period

5. **View Not Visible**
   - Detection: Check view visibility state
   - Handling: Skip updates, queue for when visible
   - Recovery: Update when view becomes visible

### Error Handling Strategy

```typescript
async function safeParseHeadings(cell: vscode.NotebookCell): Promise<Heading[]> {
    try {
        return parseHeadings(cell);
    } catch (error) {
        log(`Failed to parse headings from cell ${cell.index}: ${error}`);
        return []; // Return empty array, continue with other cells
    }
}

async function safeSync(operation: () => Promise<void>): Promise<void> {
    try {
        await operation();
    } catch (error) {
        log(`Synchronization failed: ${error}`);
        // Don't throw - allow extension to continue
    }
}
```

## Testing Strategy

### Unit Testing

Unit tests will verify individual components in isolation:

1. **Heading Parser Tests**
   - Test parsing single and multiple headings per cell
   - Test various heading levels (# through ######)
   - Test malformed heading syntax
   - Test empty cells and non-markdown cells

2. **Outline Item Tests**
   - Test OutlineItem creation with various heading levels
   - Test child cell range calculation
   - Test tree item properties (label, icon, command)

3. **Tree Data Provider Tests**
   - Test getChildren returns correct hierarchy
   - Test getTreeItem returns correct tree items
   - Test refresh triggers update event
   - Test selection synchronization

4. **Update Coordinator Tests**
   - Test debouncing with various timing scenarios
   - Test view visibility checks
   - Test update cancellation

### Property-Based Testing

Property-based tests will use **fast-check** (JavaScript/TypeScript property testing library) to verify correctness properties across many randomly generated inputs. Each property test will run a minimum of 100 iterations.

**Test Configuration**:
```typescript
import * as fc from 'fast-check';

const testConfig = { numRuns: 100 };
```

**Property Test Implementations**:

1. **Property 1: Outline structure reflects notebook headings**
   ```typescript
   // Feature: custom-notebook-outline, Property 1: Outline structure reflects notebook headings
   fc.assert(
       fc.property(
           fc.array(fc.record({
               type: fc.constantFrom('markdown', 'code'),
               headings: fc.array(fc.record({
                   level: fc.integer({ min: 1, max: 6 }),
                   text: fc.string({ minLength: 1, maxLength: 50 })
               }))
           })),
           async (cells) => {
               const notebook = await createTestNotebook(cells);
               const outlineItems = headingParser.extractNotebookHeadings(notebook);
               
               // Verify all markdown headings appear in outline
               const expectedHeadings = cells
                   .filter(c => c.type === 'markdown')
                   .flatMap(c => c.headings);
               
               return outlineItems.length === expectedHeadings.length &&
                      outlineItems.every((item, i) => 
                          item.heading.level === expectedHeadings[i].level &&
                          item.heading.text === expectedHeadings[i].text
                      );
           }
       ),
       testConfig
   );
   ```

2. **Property 2: Outline updates within time bound**
   ```typescript
   // Feature: custom-notebook-outline, Property 2: Outline updates within time bound
   fc.assert(
       fc.property(
           fc.array(fc.record({
               type: fc.constantFrom('markdown', 'code'),
               content: fc.string()
           })),
           async (cells) => {
               const notebook = await createTestNotebook(cells);
               const editor = await openNotebook(notebook);
               
               const startTime = Date.now();
               
               // Trigger a change
               await addCellToNotebook(editor, { type: 'markdown', content: '# New Heading' });
               
               // Wait for outline to update
               await waitForOutlineUpdate();
               
               const endTime = Date.now();
               
               return (endTime - startTime) <= 200;
           }
       ),
       testConfig
   );
   ```

3. **Property 3: Notebook switching updates outline**
   ```typescript
   // Feature: custom-notebook-outline, Property 3: Notebook switching updates outline
   fc.assert(
       fc.property(
           fc.tuple(
               fc.array(fc.string()), // Headings for notebook 1
               fc.array(fc.string())  // Headings for notebook 2
           ),
           async ([headings1, headings2]) => {
               const notebook1 = await createNotebookWithHeadings(headings1);
               const notebook2 = await createNotebookWithHeadings(headings2);
               
               await openNotebook(notebook1);
               const outline1 = treeProvider.getOutlineItems();
               
               await openNotebook(notebook2);
               const outline2 = treeProvider.getOutlineItems();
               
               return outline1.length === headings1.length &&
                      outline2.length === headings2.length;
           }
       ),
       testConfig
   );
   ```

4. **Property 4: Outline-to-editor synchronization**
   ```typescript
   // Feature: custom-notebook-outline, Property 4: Outline-to-editor synchronization
   fc.assert(
       fc.property(
           fc.array(fc.integer({ min: 0, max: 99 })), // Random outline item indices
           async (itemIndices) => {
               const editor = vscode.window.activeNotebookEditor;
               if (!editor) return true;
               
               const outlineItems = treeProvider.getOutlineItems();
               const selectedItems = itemIndices
                   .filter(i => i < outlineItems.length)
                   .map(i => outlineItems[i]);
               
               await syncManager.syncOutlineToEditor(selectedItems);
               
               const expectedCellIndices = selectedItems.map(item => item.cellIndex);
               const actualCellIndices = editor.selections.map(sel => sel.start);
               
               return arraysEqual(expectedCellIndices.sort(), actualCellIndices.sort());
           }
       ),
       testConfig
   );
   ```

5. **Property 5: Editor-to-outline synchronization**
   ```typescript
   // Feature: custom-notebook-outline, Property 5: Editor-to-outline synchronization
   fc.assert(
       fc.property(
           fc.array(fc.integer({ min: 0, max: 99 })), // Random cell indices
           async (cellIndices) => {
               const editor = vscode.window.activeNotebookEditor;
               if (!editor) return true;
               
               const selections = cellIndices
                   .filter(i => i < editor.notebook.cellCount)
                   .map(i => new vscode.NotebookRange(i, i + 1));
               
               editor.selections = selections;
               await syncManager.syncEditorToOutline(editor, treeProvider.getOutlineItems());
               
               const selectedOutlineItems = treeProvider.getSelectedItems();
               const expectedCellIndices = selections.map(sel => sel.start);
               const actualCellIndices = selectedOutlineItems.map(item => item.cellIndex);
               
               return arraysEqual(expectedCellIndices.sort(), actualCellIndices.sort());
           }
       ),
       testConfig
   );
   ```

6. **Property 6: Synchronization timing**
   ```typescript
   // Feature: custom-notebook-outline, Property 6: Synchronization timing
   fc.assert(
       fc.property(
           fc.array(fc.integer({ min: 0, max: 99 })),
           async (cellIndices) => {
               const editor = vscode.window.activeNotebookEditor;
               if (!editor) return true;
               
               const selections = cellIndices
                   .filter(i => i < editor.notebook.cellCount)
                   .map(i => new vscode.NotebookRange(i, i + 1));
               
               const startTime = Date.now();
               editor.selections = selections;
               await waitForOutlineSync();
               const endTime = Date.now();
               
               return (endTime - startTime) <= 100;
           }
       ),
       testConfig
   );
   ```

7. **Property 7: Bidirectional synchronization consistency**
   ```typescript
   // Feature: custom-notebook-outline, Property 7: Bidirectional synchronization consistency
   fc.assert(
       fc.property(
           fc.array(fc.integer({ min: 0, max: 99 })),
           async (cellIndices) => {
               const editor = vscode.window.activeNotebookEditor;
               if (!editor) return true;
               
               // Select in editor
               const selections = cellIndices
                   .filter(i => i < editor.notebook.cellCount)
                   .map(i => new vscode.NotebookRange(i, i + 1));
               editor.selections = selections;
               await syncManager.syncEditorToOutline(editor, treeProvider.getOutlineItems());
               
               // Get outline selection
               const outlineItems = treeProvider.getSelectedItems();
               
               // Sync back to editor
               await syncManager.syncOutlineToEditor(outlineItems);
               
               // Verify editor selection matches original
               const finalSelections = editor.selections.map(sel => sel.start).sort();
               const originalSelections = selections.map(sel => sel.start).sort();
               
               return arraysEqual(finalSelections, originalSelections);
           }
       ),
       testConfig
   );
   ```

8. **Property 8: Child cell selection correctness**
   ```typescript
   // Feature: custom-notebook-outline, Property 8: Child cell selection correctness
   fc.assert(
       fc.property(
           fc.array(fc.record({
               level: fc.integer({ min: 1, max: 6 }),
               text: fc.string({ minLength: 1 }),
               cellsBefore: fc.integer({ min: 0, max: 5 })
           })),
           async (headings) => {
               const notebook = await createNotebookWithHeadings(headings);
               const outlineItems = headingParser.extractNotebookHeadings(notebook);
               
               for (let i = 0; i < outlineItems.length; i++) {
                   const item = outlineItems[i];
                   const range = headingParser.getHeadingCellRange(i, outlineItems);
                   
                   // Find next heading of equal or higher level
                   let expectedEnd = notebook.cellCount;
                   for (let j = i + 1; j < outlineItems.length; j++) {
                       if (outlineItems[j].heading.level <= item.heading.level) {
                           expectedEnd = outlineItems[j].cellIndex;
                           break;
                       }
                   }
                   
                   if (range.end !== expectedEnd) {
                       return false;
                   }
               }
               
               return true;
           }
       ),
       testConfig
   );
   ```

9. **Property 9: Malformed heading handling**
   ```typescript
   // Feature: custom-notebook-outline, Property 9: Malformed heading handling
   fc.assert(
       fc.property(
           fc.array(fc.string()), // Random strings that may or may not be valid headings
           async (cellContents) => {
               try {
                   const notebook = await createNotebookWithContent(cellContents);
                   const outlineItems = headingParser.extractNotebookHeadings(notebook);
                   
                   // Should not crash, regardless of input
                   return true;
               } catch (error) {
                   return false; // Crash = test failure
               }
           }
       ),
       testConfig
   );
   ```

10. **Property 10: Large notebook performance**
    ```typescript
    // Feature: custom-notebook-outline, Property 10: Large notebook performance
    fc.assert(
        fc.property(
            fc.integer({ min: 200, max: 500 }), // Notebook size
            async (cellCount) => {
                const notebook = await createLargeNotebook(cellCount);
                const editor = await openNotebook(notebook);
                
                const startTime = Date.now();
                treeProvider.refresh();
                await waitForOutlineUpdate();
                const endTime = Date.now();
                
                return (endTime - startTime) <= 500;
            }
        ),
        testConfig
    );
    ```

11. **Property 11: Debouncing behavior**
    ```typescript
    // Feature: custom-notebook-outline, Property 11: Debouncing behavior
    fc.assert(
        fc.property(
            fc.array(fc.string(), { minLength: 3, maxLength: 10 }),
            async (changes) => {
                let updateCount = 0;
                const originalRefresh = treeProvider.refresh;
                treeProvider.refresh = () => {
                    updateCount++;
                    originalRefresh.call(treeProvider);
                };
                
                // Apply rapid changes (within 200ms)
                for (const change of changes) {
                    await addCellToNotebook(editor, { type: 'markdown', content: change });
                    await delay(10);
                }
                
                // Wait for debounce window
                await delay(250);
                
                // Should have updated at most once per debounce window
                const expectedMaxUpdates = Math.ceil((changes.length * 10) / 200);
                return updateCount <= expectedMaxUpdates;
            }
        ),
        testConfig
    );
    ```

12. **Property 12: Feature integration compatibility**
    ```typescript
    // Feature: custom-notebook-outline, Property 12: Feature integration compatibility
    fc.assert(
        fc.property(
            fc.array(fc.integer({ min: 0, max: 99 })),
            async (cellIndices) => {
                // Perform custom outline operation
                const outlineItems = treeProvider.getOutlineItems();
                const selectedItems = cellIndices
                    .filter(i => i < outlineItems.length)
                    .map(i => outlineItems[i]);
                await syncManager.syncOutlineToEditor(selectedItems);
                
                // Verify outline-selection-sync still works
                const editor = vscode.window.activeNotebookEditor;
                if (!editor) return true;
                
                const originalSyncManager = getOriginalOutlineSyncManager();
                try {
                    await originalSyncManager.syncOutline(editor);
                    return true; // No errors = compatible
                } catch (error) {
                    return false;
                }
            }
        ),
        testConfig
    );
    ```

### Integration Testing

Integration tests will verify the complete flow:

1. Test opening a notebook displays outline
2. Test clicking outline items navigates to cells
3. Test multi-selecting outline items selects multiple cells
4. Test "Select All Child Cells" command
5. Test bidirectional synchronization in real scenarios
6. Test configuration changes apply correctly

### Manual Testing Checklist

Since the outline view is a UI component, some manual verification is needed:

- [ ] Verify outline displays all markdown headings
- [ ] Verify heading hierarchy is correct (indentation)
- [ ] Verify clicking an outline item navigates to the cell
- [ ] Verify Ctrl+click multi-selects outline items
- [ ] Verify Shift+click range-selects outline items
- [ ] Verify selected cells highlight in outline
- [ ] Verify "Select All Child Cells" context menu works
- [ ] Verify no flickering during rapid edits
- [ ] Verify performance with large notebooks (>200 cells)

## Implementation Notes

### Reusing Existing Components

The implementation will reuse the following components from the outline-selection-sync feature:

1. **OutlineSyncManager**: For synchronizing selections between outline and editor
2. **SelectionChangeDetector**: For detecting when editor selections change
3. **Debouncing logic**: For preventing excessive updates

### Heading Parsing Strategy

Markdown headings follow the pattern: `# Heading Text`

**Regex Pattern**: `/^(#{1,6})\s+(.+)$/gm`

- `^` - Start of line
- `(#{1,6})` - 1 to 6 hash symbols (capture group for level)
- `\s+` - One or more whitespace characters
- `(.+)` - Heading text (capture group)
- `$` - End of line
- `gm` - Global and multiline flags

**Edge Cases**:
- Headings with trailing hashes: `# Heading #` - strip trailing hashes
- Headings with inline code: `# Heading with `code`` - preserve formatting
- Empty headings: `#` - skip or use placeholder text
- Headings in code blocks: Skip (only parse from markdown cells)

### Child Cell Range Calculation

To determine which cells belong to a heading:

1. Start at the heading's cell index
2. Continue until:
   - Next heading of equal or higher level (lower number)
   - End of notebook
3. Include all cells in between

**Example**:
```
Cell 0: # Heading 1 (level 1)
Cell 1: Some content
Cell 2: ## Heading 1.1 (level 2)
Cell 3: More content
Cell 4: ## Heading 1.2 (level 2)
Cell 5: Content
Cell 6: # Heading 2 (level 1)
```

- Heading 1 child range: cells 0-5 (stops at Heading 2)
- Heading 1.1 child range: cells 2-3 (stops at Heading 1.2)
- Heading 1.2 child range: cells 4-5 (stops at Heading 2)
- Heading 2 child range: cells 6-end

### Multi-Select Implementation

VS Code's TreeView API supports multi-select through the `canSelectMany` option:

```typescript
vscode.window.createTreeView('custom-notebook-outline', {
    treeDataProvider: provider,
    canSelectMany: true
});
```

Selection events are handled through `onDidChangeSelection`:

```typescript
treeView.onDidChangeSelection(event => {
    const selectedItems = event.selection;
    // Sync to editor
    syncManager.syncOutlineToEditor(selectedItems);
});
```

### Performance Optimization

1. **Debouncing**: Use 200ms debounce for outline updates
2. **Visibility Check**: Skip updates when view is not visible
3. **Incremental Updates**: Only update changed portions of the tree
4. **Caching**: Cache parsed headings until notebook changes
5. **Lazy Loading**: Load outline items on demand for very large notebooks

## Dependencies

### New Dependencies

None - all required dependencies are already present in the project.

### Existing Dependencies

- VS Code Extension API (^1.98.0)
- TypeScript (^5.8.3)
- fast-check (^3.15.0) - already added for outline-selection-sync
- @vscode/test-electron (for integration tests)

## Configuration

Add new configuration options to `package.json`:

```json
{
  "configuration": {
    "properties": {
      "jupyter-cell-tags.customOutline.enabled": {
        "type": "boolean",
        "default": true,
        "description": "Enable custom notebook outline view with multi-select support"
      },
      "jupyter-cell-tags.customOutline.updateDebounceMs": {
        "type": "number",
        "default": 200,
        "description": "Debounce delay in milliseconds for outline updates"
      },
      "jupyter-cell-tags.customOutline.showCellIndices": {
        "type": "boolean",
        "default": false,
        "description": "Show cell indices in outline item labels"
      }
    }
  }
}
```

## Migration Strategy

This is a new feature that complements the existing outline-selection-sync feature:

1. Add new modules without modifying existing code
2. Register new tree view alongside existing views
3. Reuse OutlineSyncManager and SelectionChangeDetector
4. Provide configuration option to disable if issues arise
5. Both features can coexist - custom outline for multi-select, built-in outline for single-select

## Future Enhancements

1. **Drag and Drop**: Reorder cells by dragging outline items
2. **Inline Editing**: Edit heading text directly in outline
3. **Filtering**: Filter outline by heading level or search term
4. **Collapsing**: Collapse/expand heading sections in the notebook from outline
5. **Icons**: Custom icons for different heading levels
6. **Breadcrumbs**: Show current heading in breadcrumb navigation
7. **Minimap Integration**: Highlight outline sections in editor minimap
