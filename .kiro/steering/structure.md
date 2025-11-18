# Project Structure

## Root Directory

- `src/` - TypeScript source code
- `out/` - Compiled JavaScript output
- `examples/` - Example notebooks and test workspace
- `images/` - Extension documentation images
- `.vscode/` - VS Code workspace settings and launch configs
- `*.vsix` - Packaged extension versions

## Source Organization (`src/`)

The codebase follows a feature-based modular architecture:

### Core Modules

- `extension.ts` - Main entry point, activates all features
- `helper.ts` - Utility functions and conflict detection
- `statusBar.ts` - Status bar UI components
- `json.ts` - JSON manipulation utilities

### Feature Modules

- `cellTags/` - Core cell tagging functionality
- `noteAllTags/` - All Notebook Tags tree view provider
  - `allNotebookTagsTreeDataProvider.ts`
  - `TagTreeItem.ts`, `CellTreeItem.ts`
  - `tagSorting.ts`
- `notebookRunGroups/` - Tag-based cell execution groups
  - `commands.ts`, `startup.ts`
  - `cellStatusBar.ts`, `contextKeys.ts`
  - `documents.ts`, `enums.ts`
- `cellHeadings/` - Markdown heading manipulation
  - `commands.ts`, `startup.ts`
- `cellJumpbacks/` - Bookmark/navigation system
  - `commands.ts`
  - `JumpbackTreeDataProvider.ts`
  - `jumpbackDataSource.ts`
- `cellExecution/` - Cell execution tracking
- `exportTags/` - Tag export functionality
- `importTags/` - Tag import functionality

### Shared Modules

- `models/` - Data models (e.g., `tagProperties.ts`)
- `tagProperties/` - Tag metadata management
- `util/` - Shared utilities
  - `logging.ts` - Debug logging
  - `notebookMetadata.ts` - Notebook metadata operations
  - `notebookSelection.ts` - Cell selection utilities

## Activation Pattern

Each feature module typically has:
1. `startup.ts` or registration function - Initializes the feature
2. `commands.ts` - Command implementations
3. Provider/DataSource files - Tree view or data providers

The main `extension.ts` orchestrates activation by calling each module's registration/activation function.

## Configuration Files

- `package.json` - Extension manifest with commands, views, menus, keybindings
- `tsconfig.json` - TypeScript compiler configuration
- `.prettierrc.js` - Code formatting rules
- `.editorconfig` - Editor configuration
- `.vscodeignore` - Files excluded from packaging
