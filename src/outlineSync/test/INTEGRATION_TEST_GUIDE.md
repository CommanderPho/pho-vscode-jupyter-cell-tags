# Integration Test Guide for selectAllChildCells

This guide provides manual testing steps to verify that the `selectAllChildCells` command properly integrates with outline synchronization.

## Prerequisites

1. VS Code with the extension installed
2. A Jupyter notebook with multiple cells
3. Cells tagged with at least one tag (e.g., "test-tag")
4. The Outline pane visible (View > Outline)

## Test Scenarios

### Test 1: Basic Outline Synchronization

**Steps:**
1. Open a Jupyter notebook
2. Add a tag (e.g., "test-tag") to 3-5 cells
3. Open the "All Notebook Tags" view
4. Ensure the Outline pane is visible
5. Click on the "Select All Child Cells" button for the tag

**Expected Results:**
- All cells with the tag should be selected in the notebook editor
- The Outline pane should highlight all selected cells
- No errors should appear in the console

### Test 2: Multiple Tags

**Steps:**
1. Open a Jupyter notebook
2. Add different tags to different groups of cells
3. Use "Select All Child Cells" for the first tag
4. Verify Outline updates
5. Use "Select All Child Cells" for a different tag
6. Verify Outline updates again

**Expected Results:**
- Each time the command is executed, the Outline should update to reflect the new selection
- Previous selections should be replaced with new selections
- Outline should always match the notebook editor selection

### Test 3: Large Notebooks

**Steps:**
1. Open a notebook with 50+ cells
2. Tag cells throughout the notebook (beginning, middle, end)
3. Use "Select All Child Cells" for the tag
4. Verify Outline synchronization

**Expected Results:**
- Synchronization should complete within 100ms
- No performance degradation
- All selected cells should be highlighted in Outline

### Test 4: Existing Functionality Preserved

**Steps:**
1. Open a Jupyter notebook
2. Manually select a cell
3. Verify Outline updates (existing behavior)
4. Use "Select All Child Cells" command
5. Verify Outline updates (new behavior)
6. Manually select another cell
7. Verify Outline still updates (existing behavior preserved)

**Expected Results:**
- Manual selection should still trigger Outline updates
- Command-based selection should also trigger Outline updates
- No regression in existing functionality

## Debugging

If tests fail:

1. Check the Output panel (View > Output) and select "Jupyter Cell Tags" from the dropdown
2. Look for log messages starting with "Outline synchronized" or "Failed to sync outline"
3. Verify that `jupyter-cell-tags.debugPrint` is enabled in settings for detailed logs
4. Check that the OutlineSyncManager is properly instantiated in the extension activation

## Known Limitations

- Outline synchronization requires the Outline pane to be visible
- If the Outline pane is not available, synchronization will fail gracefully without affecting command functionality
- Synchronization uses a focus-based approach which may have slight delays

