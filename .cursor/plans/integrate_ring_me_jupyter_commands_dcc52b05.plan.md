---
name: Integrate Ring Me Jupyter Commands
overview: Copy all commands and functionality from the ring-me-jupyter extension into vscode-jupyter-cell-tags, organizing the code in a new modular `ringMeJupyter` subfolder in `src`, and integrating it with the existing extension architecture.
todos:
  - id: create-ringmejupyter-folder
    content: Create src/ringMeJupyter directory structure
    status: completed
  - id: create-email-notifier
    content: Create src/ringMeJupyter/emailNotifier.ts with sendEmail function and SMTP configuration
    status: completed
  - id: create-status-bar-provider
    content: Create src/ringMeJupyter/statusBarProvider.ts with BellStatusBarItemProvider class and registration function
    status: completed
  - id: create-commands
    content: Create src/ringMeJupyter/commands.ts with registerToggleBellCommand function
    status: completed
  - id: create-startup
    content: Create src/ringMeJupyter/startup.ts with activateRingMeJupyter function that registers listeners and calls other registration functions
    status: completed
  - id: update-extension
    content: Update src/extension.ts to import and call activateRingMeJupyter
    status: completed
  - id: update-package-json
    content: Update package.json to add command, configuration, dependencies, and activation event
    status: completed
---

# Integrate Ring Me Jupyter Commands into vscode-jupyter-cell-tags

## Overview

Copy all commands and functionality from the `ring-me-jupyter` extension into `vscode-jupyter-cell-tags`, keeping the code modular by placing it in a new `src/ringMeJupyter` subfolder.

## Files to Create

### 1. `src/ringMeJupyter/startup.ts`

- Export `activateRingMeJupyter(context: vscode.ExtensionContext)` function
- Register notebook document change listener for cell execution completion
- Call command and status bar provider registration functions
- Follow the pattern used by other modules (e.g., `cellJumpbacks`, `cellHeadings`)

### 2. `src/ringMeJupyter/commands.ts`

- Export `registerToggleBellCommand(context: vscode.ExtensionContext)` function
- Register command `jupyter-cell-tags.ringMeJupyter.toggleBell`
- Toggle `notifyOnComplete` metadata on notebook cells
- Use WorkspaceEdit to update cell metadata

### 3. `src/ringMeJupyter/emailNotifier.ts`

- Export `sendEmail(cellIndex: number, cellOutput: string)` function
- Move email sending logic from original extension
- Use nodemailer to send notifications
- Read recipient email from configuration: `jupyter-cell-tags.ringMeJupyter.recipientEmail`
- Keep SMTP credentials as hardcoded constants (empty strings for now)

### 4. `src/ringMeJupyter/statusBarProvider.ts`

- Export `BellStatusBarItemProvider` class implementing `vscode.NotebookCellStatusBarItemProvider`
- Export `registerStatusBarProvider(context: vscode.ExtensionContext)` function
- Provide cell status bar items showing bell icon (🔔/🔕) based on `notifyOnComplete` metadata
- Register provider for `jupyter-notebook` notebook type

## Files to Modify

### 5. `src/extension.ts`

- Import `activateRingMeJupyter` from `./ringMeJupyter/startup`
- Call `activateRingMeJupyter(context)` in the `activate` function

### 6. `package.json`

- **Commands**: Add command definition for `jupyter-cell-tags.ringMeJupyter.toggleBell` with title "Toggle Cell Bell"
- **Configuration**: Add configuration property `jupyter-cell-tags.ringMeJupyter.recipientEmail` (type: string, default: "", description for email address)
- **Dependencies**: Add `nodemailer: ^6.10.0` to dependencies
- **DevDependencies**: Add `@types/nodemailer: ^6.4.17` to devDependencies
- **ActivationEvents**: Add `onCommand:jupyter-cell-tags.ringMeJupyter.toggleBell` to activationEvents

## Implementation Details

- Follow existing module patterns: separate files for commands, providers, and startup logic
- Use extension naming convention: `jupyter-cell-tags.ringMeJupyter.*` for commands and configuration
- Keep SMTP server, port, and credentials as hardcoded constants (empty strings) in `emailNotifier.ts`
- The notebook document change listener should check for `cell.metadata?.notifyOnComplete` and call `sendEmail` when cells complete execution
- Status bar provider should show bell icon in cell status bar, aligned to the right
- All subscriptions should be added to `context.subscriptions` for proper cleanup

## Code Structure

```
src/ringMeJupyter/
├── startup.ts          # Main activation function
├── commands.ts         # Command registration
├── emailNotifier.ts    # Email sending functionality
└── statusBarProvider.ts # Status bar item provider
```