# Technology Stack

## Core Technologies

- **Language**: TypeScript (ES2022 target)
- **Platform**: VS Code Extension API (^1.98.0)
- **Runtime**: Node.js v23.9.0 (managed via nvm)
- **Build System**: TypeScript Compiler (tsc)

## Key Dependencies

- `@vscode/jupyter-extension`: Integration with Jupyter extension API
- `@types/vscode`: VS Code extension type definitions
- `path-browserify`: Path utilities for browser compatibility

## Dev Dependencies

- `typescript` (^5.8.3)
- `@vscode/vsce`: Extension packaging tool
- `@vscode/test-electron`: Testing framework

## Build Commands

**IMPORTANT**: Always set the Node version first before running any commands:

```bash
# Set Node version (required before any other commands)
nvm use v23.9.0

# Compile TypeScript
npm run compile

# Watch mode for development
npm run watch

# Package extension as .vsix
npm run package

# Prepare for publishing
npm run vscode:prepublish
```

## TypeScript Configuration

- **Module System**: CommonJS
- **Target**: ES2022
- **Strict Mode**: Enabled (noImplicitAny, noImplicitThis)
- **Source Maps**: Enabled for debugging
- **Output Directory**: `out/`
- **Source Directory**: `src/`

## Code Style

- **Formatter**: Prettier
- **Quote Style**: Single quotes
- **Line Width**: 120 characters
- **Indentation**: 4 spaces (tabs)
- **Trailing Commas**: None
- **End of Line**: Auto

## Extension Development

The extension uses VS Code's Extension Host for debugging. Launch configuration requires:
- `--enable-proposed-api phohale.jupyter` flag
- Fixed profile: `--profile=PhoExtensionDev2025`
- Pre-launch task: TypeScript compilation

Entry point: `./out/extension.js` (compiled from `src/extension.ts`)
