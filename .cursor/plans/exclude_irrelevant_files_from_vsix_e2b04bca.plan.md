---
name: Exclude irrelevant files from VSIX
overview: Update `.vscodeignore` so `vsce package` no longer includes Cursor/SpecStory config, dev tooling, and TypeScript source in the published VSIX, reducing size and avoiding shipping internal artifacts.
todos: []
isProject: false
---

# Exclude irrelevant files from packaged extension

## Problem

Running `vsce package --no-yarn` produces a VSIX that includes many files that are irrelevant to end users and should not ship:

- **Cursor / SpecStory**: `.cursor/` (5 files), `.specstory/` (19 files), `.cursorignore`, `.cursorindexingignore`
- **Dev / CI**: `.gitignore`, `.nvmrc`, `azure-pipeline.stable.yml`, `vscode-jupyter-cell-tags.code-workspace`, `desktop.ini`, `.editorconfig`, `.prettierrc.js`
- **Source**: entire `src/` tree (TypeScript) — runtime only needs compiled `out/` (package.json `main` is `./out/extension.js`)

The VSIX currently has 264 files and 583.92 KB; a large share is `.specstory/` history and `src/` (e.g. `src/` ~285 KB in the listing).

## Approach

Use the existing `[.vscodeignore](.vscodeignore)`. It already uses gitignore-style patterns and excludes `.vscode`, `node_modules`, `examples/`, `.kiro/`, etc. Add patterns so the following are excluded from the package.

## Changes

**File: [.vscodeignore**](.vscodeignore)

Append these entries (grouped for clarity):

```gitignore
# Cursor / SpecStory
.cursor/
.specstory/
.cursorignore
.cursorindexingignore

# Dev / CI / tooling
.gitignore
.nvmrc
azure-pipeline.stable.yml
vscode-jupyter-cell-tags.code-workspace
desktop.ini
.editorconfig
.prettierrc.js
package-lock.json

# TypeScript source (runtime uses out/ only)
src/
```

**Optional** (can add if you want a minimal package):

- `CODE_OF_CONDUCT.md` — often kept for marketplace; exclude only if you prefer.
- `FM-*.ico` or `FM-{B33549E0-AF79-4E17-A777-511E230ACF50}.ico` — duplicate/alternate icon; exclude if `icon.png` is the only one you need in the package.

## Verification

After updating `.vscodeignore`:

1. Run `vsce package --no-yarn` again.
2. Run `vsce ls --tree` on the new `.vsix` and confirm:
  - No `.cursor/`, `.specstory/`, `.cursorignore`, `.cursorindexingignore`
  - No `src/` (only `out/` under the expected paths)
  - No `.gitignore`, `.nvmrc`, `azure-pipeline.stable.yml`, workspace file, `desktop.ini`, `.editorconfig`, `.prettierrc.js`, `package-lock.json`
3. Install the VSIX in VS Code (Extensions → “…” → “Install from VSIX”) and confirm the extension loads and runs (e.g. open a Jupyter notebook and use cell tags / outline).

## Notes

- `.vscodeignore` is applied by vsce during packaging; no changes to `package.json` or build scripts are required.
- Keeping `out/`, `images/`, `package.json`, `README.md`, `CHANGELOG.md`, `LICENSE`, `icon.png`, and other marketplace/extension metadata ensures the package remains valid and smaller.

