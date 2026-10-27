# Pho Jupyter Cell Tags

VS Code / Cursor extension (`phohale.pho-vscode-jupyter-cell-tags`) that extends Jupyter cell tags, run groups, outline, jumpbacks, git-diff cell highlighting, dependency chains, and notebook filtering.

This is an extension, not a web app. There is no dev server. Build output is `out/` from `npm run compile` (`tsc -p ./`). Node version is **23.9.0** (`.nvmrc`).

## Commands

```bash
npm ci
npm run compile
npm run test:unit    # node Mocha, no VS Code window
npm test             # Extension Host command matrix (@vscode/test-electron)
npm run test:gui     # WebdriverIO GUI smokes (palette, tags tree, filter webview)
npm run package      # compile + vsce package --no-yarn
```

Host tests copy `ms-toolsai.jupyter` and `ms-toolsai.jupyter-renderers` from `~/.vscode/extensions` when present. Kernel execution tests stay skipped unless `JUPYTER_CELL_TAGS_KERNEL_TESTS=1` and a Python kernel exist.

Do not publish a VSIX from an agent session. Do not commit secrets, tokens, or `.vsix` files. Marketplace credentials belong in the Cloud Agents Secrets tab, not the repo.

See `src/test/README.md` for what the suites cover.

## Cursor Cloud specific instructions

Cloud Agents run on Ubuntu using `.cursor/Dockerfile` (Node 23.9.0, xvfb, Electron libs, Google Chrome) and `.cursor/install.sh` (`npm ci`, compile, VS Code cache, Jupyter vsixes).

After this config lands on the default branch, point the Cloud Agents dashboard environment at `.cursor/environment.json` (new environments default to location None and skip the file) and trigger a Build.

- Prefer `npm run test:unit` for a fast compile/logic check after TypeScript changes.
- Use `xvfb-run -a npm test` for the host command matrix. It downloads VS Code into `$TMPDIR/pho-jct/vscode` (warmed during install).
- Use `xvfb-run -a npm run test:gui` for GUI smokes. Slower; needs a display (xvfb) and Chrome/Electron.
- Do not set `JUPYTER_CELL_TAGS_KERNEL_TESTS=1` unless a Python kernel is installed. This environment does not install one.
- Host/GUI launchers symlink the repo under `$TMPDIR/pho-jct` because the Windows checkout path contains a space. On Linux, Node ignores the `'junction'` symlink type and creates a normal symlink.
- There is no `start` process. Compile on demand with `npm run compile` if `out/` is stale after a branch switch.
- Chrome for computer-use is `/usr/bin/google-chrome-stable`.
