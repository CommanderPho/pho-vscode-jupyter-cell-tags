# Manual Testing Guide for Scrollbar Decorators

## Prerequisites

1. VS Code with the extension installed in development mode
2. A Jupyter notebook with multiple cells
3. The Jupyter extension installed

## Testing Steps

### 1. Setup Test Notebook

1. Open or create a Jupyter notebook (`.ipynb` file)
2. Add at least 10-15 cells to the notebook so you can scroll
3. Add tags to various cells:
   - Click the "+ Tag" button on a cell or use "Add Cell Tag" command
   - Add different tags like "setup", "analysis", "visualization", "todo", etc.
   - Make sure multiple cells have the same tag

### 2. Verify Basic Functionality

1. **Open the "All Notebook Tags" view**:
   - Go to the Explorer sidebar
   - Find the "All Notebook Tags" view (should be visible when a Jupyter notebook is active)

2. **Check scrollbar decorators**:
   - Look at the scrollbar on the right side of the notebook editor
   - You should see colored markers at positions corresponding to cells with tags
   - Each tag should have a distinct color
   - Scroll through the notebook to verify markers align with tagged cells

### 3. Test Tag Selection Emphasis

1. **Click on a tag in the "All Notebook Tags" view**:
   - The scrollbar decorators for that tag should become thicker (Full lane instead of Center lane)
   - The decorators should flash 3 times (on/off/on/off/on/off)
   - Each flash should last 150ms (300ms total per on/off cycle)

2. **Verify emphasis clears**:
   - Click on a different tag
   - The previous tag's decorators should return to normal
   - The new tag's decorators should emphasize and flash

### 4. Test Color Coding

1. **Custom colors**:
   - Right-click on a tag in the "All Notebook Tags" view
   - Select "Set Tag Color"
   - Choose a color from the palette or enter a custom hex color
   - Verify the scrollbar decorator changes to the selected color

2. **Auto-generated colors**:
   - Tags without custom colors should have automatically generated colors
   - The same tag should always have the same color (consistent hashing)
   - Colors should be vibrant and distinguishable from each other

### 5. Test Configuration

1. **Disable the feature**:
   - Go to Settings (File > Preferences > Settings)
   - Search for "Jupyter Cell Tags: Scrollbar Decorators"
   - Uncheck "Scrollbar Decorators: Enabled"
   - Verify scrollbar decorators disappear

2. **Re-enable the feature**:
   - Check the setting again
   - Verify scrollbar decorators reappear

### 6. Test Dynamic Updates

1. **Add a new tag**:
   - Add a new tag to a cell
   - Verify a new scrollbar decorator appears immediately

2. **Remove a tag**:
   - Remove a tag from a cell
   - Verify the scrollbar decorator is removed if it was the last cell with that tag

3. **Change notebook**:
   - Switch to a different notebook
   - Verify decorators update to reflect the new notebook's tags
   - Switch back to the original notebook
   - Verify decorators return to the original state

### 7. Test Edge Cases

1. **Empty notebook**: Verify no decorators appear and no errors occur
2. **Notebook with no tags**: Verify no decorators appear
3. **Very long notebook**: Add many cells and verify decorators still work
4. **Multiple notebooks open**: Switch between notebooks and verify decorators update correctly

## Expected Results

### Visual Appearance

- **Normal decorators**: Thin colored bars in the center of the scrollbar
- **Emphasized decorators**: Thicker colored bars spanning the full width of the scrollbar
- **Flash effect**: Smooth on/off transitions, 3 cycles, clearly visible

### Performance

- No noticeable lag when opening notebooks
- Smooth updates when adding/removing tags
- No performance impact when scrolling

### User Experience

- Decorators make it easy to locate tagged cells
- Flash effect draws attention to selected tags
- Colors are distinct and help differentiate tags
- Feature can be easily enabled/disabled

## Common Issues to Check

1. **Decorators not appearing**: 
   - Check if the feature is enabled in settings
   - Verify cells actually have tags
   - Check if the notebook is a Jupyter notebook (not a generic notebook)

2. **Flash effect not working**:
   - Verify you're clicking on tag items (not cell items) in the tree view
   - Check the console for any error messages

3. **Colors not consistent**:
   - Tag colors should be deterministic based on the tag name
   - Custom colors should persist across sessions (stored in notebook metadata)

4. **Performance issues**:
   - Test with very large notebooks (100+ cells)
   - Monitor for memory leaks or CPU spikes

## Debugging

If issues occur, check the Output panel:
1. View > Output
2. Select "Jupyter Cell Tags" from the dropdown
3. Look for log messages related to scrollbar decorators

## Screenshots to Capture

1. Notebook with scrollbar decorators showing multiple tags
2. Tree view with tags listed
3. Before/after clicking a tag (showing the flash/emphasis)
4. Settings page showing the enable/disable toggle
5. Color picker dialog for setting custom tag colors
