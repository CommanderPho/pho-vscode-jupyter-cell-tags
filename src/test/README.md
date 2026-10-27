# Extension tests

This suite launches a real VS Code window, installs `ms-toolsai.jupyter`, opens a fixture Jupyter notebook, and invokes each contributed command with `vscode.commands.executeCommand`.

## Commands

```bash
npm run compile
npm run test:unit    # node Mocha, no VS Code window
npm test             # Extension Host command matrix (`@vscode/test-electron`)
npm run test:gui     # WebdriverIO GUI smokes (palette, tags tree, filter webview)
```

Kernel-dependent execution tests are skipped unless:

```bash
set JUPYTER_CELL_TAGS_KERNEL_TESTS=1
npm test
```

F5 **Extension Tests** in `.vscode/launch.json` compiles (watch) and runs `out/test/mochaRunner.js` against `src/test/workspace`.

## What is covered

Host matrix (`npm test`):

- Registration of every `contributes.commands` id
- Tag CRUD, selection, headings, export/import
- Outline, jumpbacks, navigation, filter, git-diff, dependency-chain
- Durable-kernel `copyUrl` / `showLog` / status menu (does not start a server)
- Existing outline-sync host tests, now using the shared fixture

GUI smokes (`npm run test:gui`):

- Activation: All Notebook Tags view shows `existing-tag`
- Command Palette: **Add Tag to Cell**, type `gui-smoke-tag`
- Tags tree: click a child cell, notebook selection follows
- Filter webview: check `existing-tag`, click Filter, status is `Showing 2/9 cells`

## What is not covered

These still need notebook cell page objects that neither WebdriverIO nor ExTester ship:

- Notebook toolbar / cell title menus
- Cell status-bar `+ Tag` chips
- Tree item context menus beyond the one click smoke

## Layout

- Fixture: `src/test/fixtures/command-matrix.ipynb` (copied to a temp file per test)
- Workspace settings (all feature flags on): `src/test/workspace/.vscode/settings.json`
- Host tests: `src/**/*.vscode.test.ts` (includes tag-sorting tests because `tagSorting.ts` imports `vscode`)
- GUI smokes: `src/test/gui/*.gui.ts` (not compiled by the extension `tsc`)
- Node unit tests: `src/dependencyChain/buildChain.test.ts` and `src/outlineSync/test/setup.test.ts`
