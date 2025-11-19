# Configuration Verification Guide

## Overview
This guide provides steps to manually verify that the outline synchronization configuration is properly integrated with VS Code settings.

## Configuration Properties

The following configuration properties are available:

1. **jupyter-cell-tags.outlineSync.enabled** (boolean, default: true)
   - Enables or disables automatic outline synchronization
   
2. **jupyter-cell-tags.outlineSync.debounceMs** (number, default: 100)
   - Debounce delay in milliseconds for outline synchronization

## Verification Steps

### 1. Verify Configuration Properties Exist

1. Open VS Code Settings (File > Preferences > Settings or Ctrl+,)
2. Search for "jupyter-cell-tags.outlineSync"
3. Verify both settings appear:
   - "Outline Sync: Enabled"
   - "Outline Sync: Debounce Ms"

### 2. Verify Default Values

1. Check that "Outline Sync: Enabled" is checked (true) by default
2. Check that "Outline Sync: Debounce Ms" is set to 100 by default

### 3. Verify Configuration is Read on Extension Activation

1. Open the Developer Console (Help > Toggle Developer Tools)
2. Go to the Console tab
3. Reload the extension or restart VS Code
4. Look for log messages indicating configuration was read:
   - "OutlineSyncManager initialized with config:"
   - Should show enabled: true, debounceMs: 100

### 4. Verify Configuration Changes are Applied

1. Open a Jupyter notebook
2. Open VS Code Settings
3. Change "Outline Sync: Enabled" to false
4. Check the Developer Console for:
   - "Outline sync configuration updated: { enabled: false, debounceMs: 100 }"
5. Execute the selectAllChildCells command
6. Verify in the console that sync is skipped:
   - "Outline sync is disabled, skipping"

### 5. Verify Debounce Configuration

1. Open VS Code Settings
2. Change "Outline Sync: Debounce Ms" to 200
3. Check the Developer Console for:
   - "Outline sync configuration updated: { enabled: true, debounceMs: 200 }"
4. The new debounce value should be used for subsequent synchronizations

### 6. Verify Configuration Persistence

1. Change both configuration values
2. Close and reopen VS Code
3. Verify the settings are still at the changed values
4. Check the Developer Console to confirm the extension reads the persisted values

## Expected Behavior

### When Enabled (default)
- Outline pane updates after programmatic cell selections
- Synchronization occurs with the configured debounce delay

### When Disabled
- Outline pane does not update after programmatic cell selections
- Console shows "Outline sync is disabled, skipping"
- No performance impact from synchronization attempts

### Debounce Timing
- Lower values (e.g., 50ms) = faster updates, more frequent sync attempts
- Higher values (e.g., 200ms) = slower updates, fewer sync attempts
- Default 100ms provides good balance

## Troubleshooting

### Configuration Not Appearing
- Ensure package.json has the configuration properties defined
- Reload VS Code window (Ctrl+Shift+P > "Developer: Reload Window")

### Configuration Changes Not Applied
- Check Developer Console for configuration update messages
- Verify the configuration change listener is registered
- Ensure no errors in the console

### Sync Not Working When Enabled
- Check that jupyter-cell-tags.debugPrint is enabled to see log messages
- Verify the OutlineSyncManager is properly instantiated
- Check for any errors in the Developer Console

## Testing Checklist

- [ ] Configuration properties appear in VS Code Settings
- [ ] Default values are correct (enabled: true, debounceMs: 100)
- [ ] Configuration is read on extension activation
- [ ] Changing "enabled" setting updates the sync manager
- [ ] Changing "debounceMs" setting updates the sync manager
- [ ] Disabling sync prevents outline updates
- [ ] Configuration persists across VS Code restarts
- [ ] No errors in Developer Console during configuration changes

## Related Files

- `package.json` - Configuration property definitions
- `src/noteAllTags/allNotebookTagsTreeDataProvider.ts` - Configuration reading and change listener
- `src/outlineSync/OutlineSyncManager.ts` - Configuration usage
