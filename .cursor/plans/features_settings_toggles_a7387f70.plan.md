---
name: Features settings toggles
overview: Add a single concise Settings section of feature on/off toggles that gate optional modules, keep core tagging always-on, and leave existing detailed tuning settings in place (with deprecated aliases for the old scattered enable keys).
todos:
  - id: pkg-features-section
    content: Split package.json configuration into Features + main sections; add features.* booleans; deprecate old enable keys; update when clauses for views/commands
    status: completed
  - id: feature-flags-helper
    content: Add src/util/featureFlags.ts with isFeatureEnabled + one-shot migrate from deprecated keys
    status: completed
  - id: wire-activation
    content: Gate optional activate/register calls in extension.ts and update modules that read old enable flags
    status: completed
  - id: verify-settings-ui
    content: Manually verify Features group, when-clause hiding, migration from old keys, and defaults unchanged
    status: completed
isProject: false
---

# Consolidate optional features into one Settings group

## Decision (locked)

- **Option 3**: one compact **Features** section of boolean toggles that gate activation; keep existing detailed settings (colors, debounce, ports, sub-enables) as-is for tuning.
- **Core tagging stays always-on**: Cell Tags / All Notebook Tags, add/remove/import/export tags, run groups, cell headings, execution tracking, selection status bar.

## Settings UI

Split [`package.json`](package.json) `contributes.configuration` into an **array** with two sections:

1. **Features** (`order: 1`) — only booleans under `jupyter-cell-tags.features.*`
2. **Jupyter Cell Tags** (`order: 2`) — all current tuning/debug settings (unchanged keys for colors, debounce, pythonPath, etc.)

Feature toggles (defaults match today’s behavior so nothing flips for existing users):

| Key | Default | Gates |
|-----|---------|--------|
| `features.jumpbacks` | `false` | Jumpbacks commands/views/keybindings |
| `features.errorNavigation` | `false` | Prev/Next error cell commands |
| `features.outlineSync` | `true` | Outline sync module |
| `features.customOutline` | `true` | Custom NB Outline view + related commands |
| `features.scrollbarDecorators` | `true` | Tag scrollbar decorators |
| `features.jupyterEnhancements` | `true` | Jupyter enhancements module (sub-enables stay under detailed settings) |
| `features.gitDiff` | `true` | Git modified cells highlight + view |
| `features.dependencyChain` | `true` | Dependency chain commands + view |
| `features.notebookFilter` | `true` | Notebook cell filter webview + commands |
| `features.ringMeJupyter` | `true` | Ring-me notifications |
| `features.durableKernel` | `true` | Durable external Jupyter module |

Leave `debugPrint` / `showDebugExecutionMessages` in the main settings section (not Features).

## Deprecate old enable keys

Keep these properties in the main section but mark deprecated with `markdownDeprecationMessage` pointing at the new Features keys:

- `enableJumpbacks` → `features.jumpbacks`
- `enableErrorNavigation` → `features.errorNavigation`
- `outlineSync.enabled` → `features.outlineSync`
- `customOutline.enabled` → `features.customOutline`
- `scrollbarDecorators.enabled` → `features.scrollbarDecorators`

Do **not** remove them yet (settings.json compatibility).

## Runtime wiring

Add a small helper [`src/util/featureFlags.ts`](src/util/featureFlags.ts):

- `isFeatureEnabled(feature)` reads `jupyter-cell-tags.features.<name>`
- One-shot migrate on activate: if a deprecated key has a user/workspace value and the new Features key does not, copy the value into the Features key (same `ConfigurationTarget`)
- Optional: `onDidChangeConfiguration` helper for modules that already hot-reload

Update [`src/extension.ts`](src/extension.ts) so optional `activate*` / `register*` calls are wrapped in `isFeatureEnabled(...)`. Core path stays unconditional.

Update modules that already read the old enable flags to use `features.*` (via the helper):

- [`src/outlineSync/startup.ts`](src/outlineSync/startup.ts) / config readers
- [`src/customOutline/startup.ts`](src/customOutline/startup.ts)
- [`src/noteAllTags/scrollbarDecorators.ts`](src/noteAllTags/scrollbarDecorators.ts)
- [`src/cellNavigation/navigationMenu.ts`](src/cellNavigation/navigationMenu.ts)
- [`src/externalKernel/startup.ts`](src/externalKernel/startup.ts) — skip entire activate when `durableKernel` is false; keep `externalKernel.autoRegisterOnNotebookOpen` as a detail under Durable Kernel

## package.json `when` clauses

Point UI gating at the Features keys so toggles take effect without code changes for contributed UI:

- Jumpbacks commands/menus/views/keybindings: `config.jupyter-cell-tags.features.jumpbacks`
- Error navigation commands: `config.jupyter-cell-tags.features.errorNavigation`
- Custom outline view: `config.jupyter-cell-tags.features.customOutline`
- Add `when` for views that are currently always shown when a notebook is active:
  - `git-modified-cells-view` → `... && config.jupyter-cell-tags.features.gitDiff`
  - `dependency-chain-view` → `... && config.jupyter-cell-tags.features.dependencyChain`
  - `notebook-cell-filter-view` → `... && config.jupyter-cell-tags.features.notebookFilter`
- Gate Durable Kernel / filter / git / dependency commands similarly where they are contributed

Hot-toggle expectation: views/commands hide/show immediately via `when`. Modules that only register listeners at activate may need a window reload after enabling; show a short information message on Features change when a reload is required (for modules without existing hot-reload). Modules that already handle config changes (outline sync, custom outline, scrollbar decorators) keep working without reload.

## Out of scope

- Moving color/port/debounce settings into Features
- Making core tagging toggleable
- Removing deprecated keys in this change
- New Features toggles for cell history / metadata display (leave always-on unless requested later)

## Verification

1. Open Settings → search extension → confirm a single **Features** group of ~11 checkboxes, with detailed options still under **Jupyter Cell Tags**.
2. Disable `customOutline` / `jumpbacks` / `gitDiff` / `notebookFilter` / `dependencyChain` → matching Explorer views and commands disappear.
3. Disable `jupyterEnhancements` / `durableKernel` → modules do not activate (reload once if needed).
4. User with old `enableJumpbacks: true` still gets Jumpbacks after migrate; Settings UI shows deprecation on the old key.
