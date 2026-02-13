# Research: VS Code APIs for Jupyter Notebook Scrollbar Markers

## Overview

This document researches all available methods to add markers to the scrollbar/minimap in Jupyter notebooks in VS Code.

## Key Question

**User observation:** "I see red lines in my Jupyter notebook scrollbar (from diagnostics). Can we use that same mechanism?"

## Available APIs

### 1. TextEditorDecorationType (Current Implementation) ✅

**What it is:** The primary API for adding visual decorations to editors, including scrollbar markers.

**How it works:**
```typescript
const decorationType = vscode.window.createTextEditorDecorationType({
    overviewRulerColor: '#FF0000',           // Color in scrollbar
    overviewRulerLane: vscode.OverviewRulerLane.Center,  // Position
    backgroundColor: '#ff000020',             // Optional background
    border: '1px solid #ff0000',              // Optional border
    isWholeLine: true                         // Apply to full line
});

// Apply to a text editor
textEditor.setDecorations(decorationType, [range]);
```

**OverviewRulerLane Options:**
- `Center` - Narrow marker in center of scrollbar (default)
- `Full` - Wide marker spanning full scrollbar width (for emphasis)
- `Left` - Marker on left side
- `Right` - Marker on right side

**Pros:**
- Full control over colors
- Multiple decoration types per editor
- Can combine with other visual effects (background, border)
- Works with notebook cell text editors

**Cons:**
- Requires finding the TextEditor for each notebook cell
- Only applies to visible text editors
- Need to re-apply when cells become visible

**Current Usage in This Extension:**
- `scrollbarDecorators.ts` - Tag-based markers with auto-generated colors
- `cellVisualHighlight.ts` - Orange highlight with scrollbar marker
- `jupyterEnhancements/extension.ts` - Success/error backgrounds

### 2. DiagnosticCollection (Alternative Approach) ⚠️

**What it is:** API for reporting code problems (errors, warnings, info).

**How it works:**
```typescript
const diagnosticCollection = vscode.languages.createDiagnosticCollection('myExtension');

// Create diagnostics for a document
const diagnostic = new vscode.Diagnostic(
    range,                                    // Range in document
    'Message text',                           // Message shown on hover
    vscode.DiagnosticSeverity.Error           // Error, Warning, Information, Hint
);

diagnosticCollection.set(document.uri, [diagnostic]);
```

**Diagnostic Severities and Colors:**
- `Error` - Red markers in scrollbar
- `Warning` - Yellow/orange markers
- `Information` - Blue markers
- `Hint` - Gray/subtle markers

**Pros:**
- Automatically appears in scrollbar
- Works across all editors for the same document
- Persists even when editor is not visible
- Shows in Problems panel
- Native VS Code integration

**Cons:**
- Limited to 4 colors (error, warning, info, hint)
- Semantic meaning (implies code problems)
- Shows in Problems panel (may confuse users)
- Requires a message (shown on hover)

**Recommendation:** Could be used for tags but semantically incorrect. Better for actual code issues.

### 3. NotebookEditor API (No Direct Scrollbar Support) ❌

**Investigation Result:** VS Code's NotebookEditor API does **not** provide direct methods for:
- Adding scrollbar decorations
- Controlling the notebook-level scrollbar
- Adding markers to the notebook overview ruler

**Workaround:** Apply decorations to individual cell TextEditors.

## How Diagnostics Show in Notebook Scrollbars

When you see red lines in Jupyter notebook scrollbars, they come from:

1. **Python Language Server** - Linting errors, type errors
   - Uses DiagnosticCollection
   - Automatically creates scrollbar markers
   - Red for errors, yellow for warnings

2. **Notebook Execution Errors** - Runtime errors in cells
   - May use decorations or diagnostics depending on implementation
   - Handled by Jupyter extension

3. **Other Extensions** - ESLint, Pylint, etc.
   - All use DiagnosticCollection
   - Aggregate in scrollbar

## Comparison: Decorations vs Diagnostics

| Feature | TextEditorDecorationType | DiagnosticCollection |
|---------|-------------------------|----------------------|
| Custom colors | ✅ Any color | ❌ 4 fixed colors |
| Scrollbar markers | ✅ Yes | ✅ Yes |
| Multiple per editor | ✅ Yes | ✅ Yes |
| Semantic meaning | Neutral | Code problems |
| Problems panel | ❌ No | ✅ Yes (may be unwanted) |
| Hover message | Optional | Required |
| Persistence | Manual | Automatic |
| Cell visibility | Must handle | Automatic |

## Recommended Approach for This Extension

### For Tag Markers: TextEditorDecorationType (Current) ✅

**Why:**
- Tags are not "problems" - using Diagnostics would be semantically wrong
- Need full color control for distinguishing tags
- Don't want tags appearing in Problems panel
- Current implementation is correct

**Improvement Needed:**
- Better handling of cell visibility
- Apply decorations when cells become visible
- Store pending decorations for non-visible cells

### Alternative: Hybrid Approach

Could use both APIs for different purposes:
- **Decorations** for tag markers (current)
- **Diagnostics** for actual issues (if extension adds validation features)

## Code Examples

### Example 1: Current Tag Decoration (scrollbarDecorators.ts)

```typescript
private getOrCreateDecorationType(tag: string, color: string): vscode.TextEditorDecorationType {
    if (this.decorationTypes.has(tag)) {
        return this.decorationTypes.get(tag)!;
    }
    
    const decorationType = vscode.window.createTextEditorDecorationType({
        overviewRulerColor: color,
        overviewRulerLane: vscode.OverviewRulerLane.Center,
    });
    
    this.decorationTypes.set(tag, decorationType);
    return decorationType;
}
```

### Example 2: If We Used Diagnostics (NOT RECOMMENDED)

```typescript
const diagnosticCollection = vscode.languages.createDiagnosticCollection('jupyter-cell-tags');

function addTagMarkers(notebook: vscode.NotebookDocument) {
    for (let i = 0; i < notebook.cellCount; i++) {
        const cell = notebook.cellAt(i);
        const tags = getCellTags(cell);
        
        if (tags.length > 0) {
            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(0, 0, 0, 0),
                `Tags: ${tags.join(', ')}`,
                vscode.DiagnosticSeverity.Information  // Blue marker
            );
            
            diagnosticCollection.set(cell.document.uri, [diagnostic]);
        }
    }
}
```

**Problems with this approach:**
- All tags would be same color (blue)
- Shows in Problems panel as "Information"
- Semantically incorrect (tags aren't problems)
- Clutters the Problems view

## Conclusion

### Current Implementation is Correct ✅

The extension uses `TextEditorDecorationType` with `overviewRulerColor`, which is the **correct and recommended approach** for:
- Custom colored markers
- Non-problem semantic meaning
- Full visual control

### Issue is Likely Implementation Detail

The problem reported ("I don't see decorators") is likely due to:
1. Cell text editors not being visible when decorations are applied
2. Need for better handling of cell visibility changes
3. Timing issues with when editors become available

### Improvement Plan

Fix the pending decorations mechanism to:
1. Store decorations for cells without visible editors
2. Apply them when editors become visible
3. Log diagnostic information for debugging

## References

- [VS Code Decoration API](https://code.visualstudio.com/api/references/vscode-api#TextEditorDecorationType)
- [Diagnostic API](https://code.visualstudio.com/api/references/vscode-api#DiagnosticCollection)
- [Notebook API](https://code.visualstudio.com/api/extension-guides/notebook)
- [Overview Ruler Lane](https://code.visualstudio.com/api/references/vscode-api#OverviewRulerLane)
