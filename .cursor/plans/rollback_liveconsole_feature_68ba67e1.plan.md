---
name: Rollback liveConsole feature
overview: Remove the Live TypeScript Console feature and its runtime `typescript` dependency so extension activation cannot fail on that path, then bump to 0.8.3.
todos:
  - id: delete-liveconsole
    content: Delete src/liveConsole/ and liveConsole.vscode.test.ts
    status: completed
  - id: unwire
    content: Remove liveConsole from extension.ts and featureFlags.ts
    status: completed
  - id: package-json
    content: Strip contributes/activationEvents; move typescript to devDeps; bump 0.8.3
    status: completed
  - id: packaging-tests
    content: Revert .vscodeignore typescript includes; clean test settings/wdio; rewrite featureLifecycle tests
    status: completed
  - id: verify
    content: npm install, compile, test:unit
    status: completed
isProject: false
---

# Rollback liveConsole and bump to 0.8.3

Remove every Live Console surface so nothing in activation/package contributes can load `typescript` or `src/liveConsole/**`. Bump [`package.json`](package.json) **0.8.2 → 0.8.3**.

## Delete feature sources and tests

- Delete directory [`src/liveConsole/`](src/liveConsole/) (startup, panel, evaluator, consoleApi, unit/isolation tests).
- Delete [`src/test/commands/liveConsole.vscode.test.ts`](src/test/commands/liveConsole.vscode.test.ts).

## Unwire feature flags and activation

- [`src/extension.ts`](src/extension.ts): remove the `liveConsole` entry from `optionalFeatures`.
- [`src/util/featureFlags.ts`](src/util/featureFlags.ts): remove `liveConsole` from `FeatureKey`, `FEATURE_KEYS`, `FEATURE_SETTING_LABELS`, and `FEATURE_DEFAULTS`.

## Strip package.json contributes and deps

In [`package.json`](package.json):

- Remove activation event `onCommand:jupyter-cell-tags.liveConsole.open`.
- Remove setting `jupyter-cell-tags.features.liveConsole`.
- Remove command + commandPalette entries for `jupyter-cell-tags.liveConsole.open`.
- Drop `./out/liveConsole/*.test.js` from `test:unit` (keep `featureLifecycle.test.js` after rewrite below).
- Move `typescript` from `dependencies` back to `devDependencies`.
- Set `