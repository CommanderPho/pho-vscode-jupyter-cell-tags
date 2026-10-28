---
name: Features status bar
overview: Add a always-available status bar item that opens a multi-select Quick Pick of every `jupyter-cell-tags.features.*` toggle. Checkboxes write the same Settings keys the FeatureController already watches, and the list stays open until the user clicks outside or presses Escape.
todos:
  - id: feature-flags-helpers
    content: Export FEATURE_KEYS, labels, and updateFeatureSetting (inspect-based ConfigurationTarget)
    status: pending
  - id: status-bar-picker
    content: Status bar item + createQuickPick (canSelectMany, hideOnDidAccept false, ignoreFocusOut false) + command
    status: pending
  - id: package-and-activate
    content: Contribute jupyter-cell-tags.toggleFeatures; register always-on from extension.ts
    status: pending
  - id: host-test
    content: "Host test: picker selection writes features.* and FeatureController reacts; restore settings"
    status: pending
isProject: false
---

# Features status bar picker

The live `FeatureController` already applies `jupyter-cell-tags.features.*` without reload. This adds a status bar entry that writes those same keys.

## UI

New always-on (not feature-gated) status bar item, registered from [`src/extension.ts`](src/extension.ts) next to [`CellSelectionsStatusBarItem`](src/statusBar.ts):

- Alignment: **Right**, priority **101** (just left of the existing heart/selection item at 100)
- Text: `$(extensions) JCT` plus `enabled/total` (e.g. `8/13`)
- Tooltip: `Jupyter Cell Tags features`
- Visible even without a notebook so durable kernel / outline can be toggled before opening one
- Command: `jupyter-cell-tags.toggleFeatures` (also in the Command Palette)

Clicking it opens `vscode.window.createQuickPick` (not `showQuickPick`, which always closes on accept):

- `canSelectMany: true` — checkbox per feature
- `hideOnDidAccept: false` — Enter / checkbox does not dismiss (VS Code 1.96+; engine is `^1.98.0`)
- `ignoreFocusOut: false` — click outside or Escape hides and disposes
- Title: `Jupyter Cell Tags features`
- Placeholder: `Toggle features. Click outside or press Escape to close.`

Do **not** call `hide()` from `onDidAccept` or `onDidChangeSelection`.

## Items and Settings sync

Export a stable list from [`src/util/featureFlags.ts`](src/util/featureFlags.ts):

- `FEATURE_KEYS`: every `FeatureKey`
- Labels taken from the package.json Features descriptions (strip leading emoji noise or keep them — keep, they match Settings)
- Also include `cellNavigation` in the picker: it is a Features setting in [`package.json`](package.json) but not a `FeatureKey`. Write `jupyter-cell-tags.features.cellNavigation` only; no controller activate.

Each QuickPick item:

- `label`: description from Settings
- `picked` / in `selectedItems` iff `isFeatureEnabled` (or `config.get` for `cellNavigation`)
- `detail`: `jupyter-cell-tags.features.<key>`

On `onDidChangeSelection`, diff previous vs new selected keys and `config.update` only what changed.

**Write target:** most specific scope that already has an explicit value (`workspaceFolder` then `workspace` then `global`); if none, **Global**. That keeps the picker in lockstep with the Settings UI the user is actually editing, instead of creating a workspace override that hides a user setting.

Guard with a `updating` flag so programmatic `selectedItems = ...` (after our own write, or Settings changed in another window) does not loop.

While the pick is open, subscribe to `onDidChangeConfiguration` for `jupyter-cell-tags.features` and refresh checkmarks + status bar count. FeatureController already reacts to those writes.

Add `updateFeatureSetting(key, enabled)` next to `isFeatureEnabled` so the picker and tests share one write path.

## Files

- New [`src/featureToggle/featureToggleStatusBar.ts`](src/featureToggle/featureToggleStatusBar.ts) — status bar + picker + command
- [`src/util/featureFlags.ts`](src/util/featureFlags.ts) — `FEATURE_KEYS`, labels, `updateFeatureSetting`
- [`src/extension.ts`](src/extension.ts) — `registerFeatureToggleStatusBar(context)` on the real context (always on)
- [`package.json`](package.json) — contribute `jupyter-cell-tags.toggleFeatures` (Command Palette; no notebook `when`)

## Tests

Host test in [`src/test/commands/featureToggle.vscode.test.ts`](src/test/commands/featureToggle.vscode.test.ts) (restore settings in teardown, as today):

1. Command is registered.
2. Drive `createQuickPick` without the fire-on-`show` stub in [`uiStubs.ts`](src/test/helpers/uiStubs.ts) (that stub auto-accepts and would close the flow). Either add `stubCreateQuickPickManual()` that returns the fake, or invoke `updateFeatureSetting` + assert `whenFeatureTogglesIdle` — prefer a small helper that exposes the fake pick: set `selectedItems` to drop `jumpbacks`, assert workspace/global config and that `addJumpback` unregisters, without calling `hide()`.
3. Status bar command does not throw.

Keep existing hot-toggle tests.

After TypeScript: `npm run test:unit`, then `npm test`.
