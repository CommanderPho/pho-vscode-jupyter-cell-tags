---
name: Fix tag color rendering in tree view
overview: Fix the custom tags tree view to display the actual tag color by updating TagTreeItem to use TagPropertiesManager and render custom colored icons via SVG data URIs.
todos:
  - id: update-tag-tree-item
    content: Update TagTreeItem to use TagPropertiesManager.getTagProperties() instead of reading metadata directly
    status: completed
  - id: create-colored-icon
    content: Create helper function to generate SVG data URI with custom color for the icon
    status: completed
  - id: update-icon-rendering
    content: Update iconPath assignment in TagTreeItem to use the colored SVG icon when tag has a color
    status: completed
    dependencies:
      - create-colored-icon
---

# Fix Tag Color Rendering in Custom Tags Tree View

## Problem

When setting a tag's color, the color is saved correctly but the custom tags tree view doesn't display the updated color. The icon remains using a hardcoded theme color instead of the actual tag color.

## Root Causes

1. **Stale data**: `TagTreeItem.getTagProperties()` reads directly from `notebook.metadata` instead of using `TagPropertiesManager.getTagProperties()`, which can return stale data.
2. **Hardcoded icon color**: The icon uses `new vscode.ThemeColor('charts.foreground')` instead of the actual tag color. VS Code TreeItem icons don't support arbitrary hex colors via `ThemeIcon`, but we can use a data URI with an SVG.

## Solution

### 1. Update `TagTreeItem` to use `TagPropertiesManager`

- Modify `TagTreeItem.getTagProperties()` to use `TagPropertiesManager.getTagProperties()` instead of reading metadata directly
- This ensures we always get the latest tag properties

### 2. Create custom colored icon using SVG data URI

- Replace the hardcoded `ThemeColor('charts.foreground')` with a function that creates a data URI containing an SVG circle with the actual hex color
- The SVG should be a simple filled circle using the tag's color value
- Use `vscode.Uri.parse()` to create the data URI

## Files to Modify

### [`src/noteAllTags/TagTreeItem.ts`](src/noteAllTags/TagTreeItem.ts)

- Import `TagPropertiesManager` 
- Update `getTagProperties()` method to use `TagPropertiesManager.getTagProperties()`
- Create a helper function `createColoredIconUri(color: string)` that generates an SVG data URI with the color
- Update the icon path assignment to use the colored icon when a color is available

## Implementation Details

The SVG data URI will have this format:

```
data:image/svg+xml;base64,<base64-encoded-svg>
```

Where the SVG is a simple circle:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">
  <circle cx="8" cy="8" r="6" fill="#HEXCOLOR"/>
</svg>
```

This approach allows VS Code to display custom colors in tree view icons while maintaining compatibility with the existing refresh mechanism.