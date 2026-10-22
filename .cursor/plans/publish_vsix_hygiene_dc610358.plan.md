---
name: Publish VSIX hygiene
overview: Fix the hard vsce publish failure (icon over 1024x1024), stop shipping internal files, and refresh CHANGELOG/README so 0.7.2 is marketplace-ready. Do not publish from this plan; stop after a clean `vsce package`.
todos:
  - id: resize-icon
    content: Resize icon.png to 128x128 (max 1024x1024)
    status: completed
  - id: vscodeignore
    content: Exclude test-uri.js, .agents, .github, nested extension/, TS sources except analyzeSymbols.py, maps, and tests
    status: completed
  - id: changelog
    content: Write CHANGELOG 0.7.2 user-facing notes since 0.5.9
    status: completed
  - id: readme
    content: "Marketplace README: version 0.7.2, current features, drop debug diary"
    status: completed
  - id: manifest
    content: Remove package.json browser field
    status: completed
  - id: verify-package
    content: vsce ls --tree and vsce package; do not publish
    status: completed
isProject: false
---

# Publish hygiene for 0.7.2

`vsce publish` already ran and **failed**:

```
ERROR  The provided icon image exceeds the maximum allowed dimensions of 1024 by 1024 pixels.
INFO  Publishing 'phohale.pho-vscode-jupyter-cell-tags v0.7.2'...
```

Marketplace is still **0.5.9** (gallery CDN). Local [`package.json`](package.json) is already **0.7.2** — do not bump further. Retry publish only after the steps below.

## 1. Resize `icon.png` (hard blocker)

[`icon.png`](icon.png) is larger than 1024x1024. Marketplace max is 1024x1024; VS Code recommends **128x128**.

- Overwrite [`icon.png`](icon.png) with a 128x128 PNG (keep aspect, no upscaling artifacts).
- Do not change [`package.json`](package.json) `"icon": "icon.png"`.

## 2. Stop shipping junk (`.vscodeignore`)

The current package listing includes files users should never get:

- `test-uri.js` (local SVG URI experiment; also staged in git — do not commit)
- `.agents/` (internal task notes)
- `.github/` (research notes, not issue templates needed at runtime)
- nested `extension/` (56 files / 254 KB — leftover tree, not referenced by `main`)
- `src/` **8 files** because [`.vscodeignore`](.vscodeignore) un-ignores the whole `dependencyChain/` folder
- compiled tests and source maps under `out/` (`*.test.js`, `out/**/test/**`, `*.map`)

Update [`.vscodeignore`](.vscodeignore):

```
test-uri.js
.agents/
.github/
extension/

src/**
!src/dependencyChain/
src/dependencyChain/**
!src/dependencyChain/analyzeSymbols.py

**/*.map
**/*.test.js
out/**/test/**
```

Keep [`src/dependencyChain/analyzeSymbols.py`](src/dependencyChain/analyzeSymbols.py): [`analyzeNotebook.ts`](src/dependencyChain/analyzeNotebook.ts) loads it at runtime from `src/...` then `out/...`.

Do **not** take on bundling. The 119-JS-file warning is optional and out of scope.

## 3. CHANGELOG for 0.7.2

[`CHANGELOG.md`](CHANGELOG.md) is still "Unreleased / Initial release" plus "0.5.9 Added colored tags" (0.28 KB in the VSIX). Marketplace listings show this file.

Replace `[Unreleased]` with a **0.7.2** section covering user-facing work since 0.5.9, including:

- Feature flags / per-feature settings
- Explorer views: All Notebook Tags, Jumpbacks, Custom NB Outline, Executed Cells, Git Modified Cells, Dependency Chain, Notebook Cell Filter
- Durable Jupyter kernel
- Tag color / hot-age / sort, git diff highlights, cell filter, jumpbacks
- Emoji prefixes on views, related settings, and commands

Keep the 0.5.9 entry.

## 4. Marketplace README

[`README.md`](README.md) is what the gallery renders. It currently still says **Version: 0.3.6** and includes personal debug notes (launch.json dumps, nodenv, proposed-api) that already appear on the live marketplace page.

Trim to a marketplace-facing page:

- Keep the fork/install story and "uninstall official Microsoft Jupyter Cell Tags first"
- Set version to **0.7.2**
- Replace "More undocumented commands..." with a short list of the views/commands above
- Drop developer diary, CLA-bot boilerplate, and pending-features that already exist (`removeTagFromAllCells`)

Leave `LICENSE` / Microsoft trademark blurb only if still accurate; do not rewrite `CODE_OF_CONDUCT.md`.

## 5. Small manifest cleanup

In [`package.json`](package.json):

- Remove `"browser": "./out/extension.js"`. This extension uses Node APIs (`child_process` for the analyzer and durable kernel) and is not a web extension.
- Leave `"preview": true` and version `0.7.2` unchanged.

## 6. Verify, then you publish

```
npx vsce ls --tree
npx vsce package --no-yarn
```

Confirm the tree has no `test-uri.js`, `.agents/`, `.github/`, nested `extension/`, TypeScript under `src/` (except `analyzeSymbols.py`), `*.map`, or `*.test.js`. Then retry `vsce publish` locally (this plan will not publish).
