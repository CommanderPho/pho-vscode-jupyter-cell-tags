## 2024-05-18 - [Optimization] Debounce Context Key Updates for Run Groups
**Learning:** `updateContextKeys` in `notebookRunGroups/contextKeys.ts` was running synchronously every time a notebook changed or opened, and scanning *all* visible notebooks and their cells. This is a potential performance bottleneck, especially since `documentOpen` and `notebookEditorChanged` events fire rapidly.
**Action:** Implemented a debounced version of `updateContextKeys` to prevent unnecessary performance degradation when notebooks are opened or changed rapidly.
