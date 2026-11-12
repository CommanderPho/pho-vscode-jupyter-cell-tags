---
name: Live TypeScript Console
overview: Add a developer-only extension-host TypeScript REPL (WebviewPanel) that transpile+evals snippets in-process with curated access to `vscode`, the active notebook, and the Jupyter kernel—so you can prototype extension logic without reloading the Extension Host or killing the kernel.
todos:
  - id: feature-flag
    content: Add liveConsole FeatureKey (default false), package.json config/command/activationEvents, wire optionalFeatures in extension.ts
    status: completed
  - id: evaluator-api
    content: Implement consoleApi + evaluator (transpileModule, AsyncFunction, result/console capture, executeOnKernel)
    status: completed
  - id: webview-panel
    content: Implement LiveConsolePanel webview (textarea, Run/Clear, Cmd/Ctrl+Enter, output log, kernel/notebook status)
    status: completed
  - id: startup
    content: "Implement liveConsole/startup.ts: open command, single-panel reuse, dispose cleanly on feature toggle"
    status: completed
  - id: tests
    content: Unit tests for evaluator; enable feature in test workspace; host registration/open smoke; keep featureToggle coverage
    status: completed
isProject: false
---

# Live Extension-Host TypeScript Console|