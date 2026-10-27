# Extension tests

This suite launches a real VS Code window, installs `ms-toolsai.jupyter`, opens a fixture Jupyter notebook, and invokes each contributed command with `vscode.commands.executeCommand`.

## Commands

```bash
npm run compile
npm run test:unit    # node Mocha, no VS Code window
npm test             # Extension Host command matrix (`@vscode/test-electron`)
```

Kernel-dependent execution tests are skipped unless:

```bash
set JUPYTER_CELL_TAGS_KERNEL_TESTS=1
npm test
```

F5 **Extension Tests** in `.vscode/launch.json` compiles (watch) and runs `out/test/mochaRunner.js` against `src/test/workspace`.

## What is covered

- Registration of every `contributes.commands` id
- Tag CRUD, selection, headings, export/import
- Outline, jumpbacks, navigation, filter, git-diff, dependency-chain
- Durable-kernel `copyUrl` / `showLog` / status menu (does not start a server)
- Existing outline-sync host tests, now using the shared fixture

## What is not covered (later GUI smoke)

These need WebdriverIO or ExTester; neither has notebook cell page objects:

- Command Palette titles and `when` clauses
- Notebook toolbar / cell title menus
- Cell status-bar `+ Tag` chips
- Filter webview Apply click
- Tree item context menus

Suggested later smokes: activation + tags view visible; palette Add Tag; tree click selects cells; filter webview apply.

## Layout

- Fixture: `src/test/fixtures/command-matrix.ipynb` (copied to a temp file per test)
- Workspace settings (all feature flags on): `src/test/workspace/.vscode/settings.json`
- Host tests: `src/**/*.vscode.test.ts` (includes tag-sorting tests because `tagSorting.ts` imports `vscode`)
- Node unit tests: `src/dependencyChain/buildChain.test.ts` and `src/outlineSync/test/setup.test.ts`
