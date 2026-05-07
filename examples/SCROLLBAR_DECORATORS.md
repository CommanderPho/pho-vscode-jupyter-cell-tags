# Scrollbar Decorators for Notebook Tags

## Overview

The scrollbar decorator feature adds visual indicators to the notebook's scrollbar (overview ruler) that show the locations of cells with specific tags. This makes it easy to quickly see where tagged cells are located within your notebook.

## How to Use

1. **Enable the Feature**: The feature is enabled by default. To disable it, go to Settings and search for "Jupyter Cell Tags: Scrollbar Decorators Enabled" and toggle it off.

2. **Add Tags to Cells**: Add tags to your notebook cells using the standard cell tagging features (+ Tag button or "Add Cell Tag" command).

3. **View Decorators**: Open the "All Notebook Tags" view in the Explorer sidebar. You'll see colored markers in the scrollbar for each tagged cell.

4. **Emphasize Tags**: Click on a tag in the "All Notebook Tags" view to emphasize its decorators. They will become thicker and flash 3 times to draw your attention.

## Color Coding

- **Custom Colors**: If you've assigned a custom color to a tag (via the tag properties), that color will be used for the scrollbar decorator.
- **Auto-Generated Colors**: If no custom color is set, the extension will automatically generate a vibrant color based on the tag name using a hash function. This ensures each tag gets a consistent, unique color.

## Configuration

- **Setting**: `jupyter-cell-tags.scrollbarDecorators.enabled`
- **Type**: Boolean
- **Default**: `true`
- **Description**: Enable/disable scrollbar decorators showing tag locations in the notebook. When a tag is selected in the All Notebook Tags view, the decorators will be emphasized and flash.

## Example Use Cases

1. **Code Organization**: Tag cells with "setup", "analysis", "visualization", etc., and quickly see the structure of your notebook.

2. **TODO Tracking**: Tag cells with "todo" or "fixme" and easily locate them in the scrollbar.

3. **Run Groups**: Tag cells that belong to specific run groups and see where they're distributed in your notebook.

4. **Documentation**: Tag cells with "doc" or "explanation" to identify documentation sections.

## Technical Details

- Decorators use the `overviewRulerLane.Center` for normal display
- Selected tags use `overviewRulerLane.Full` for emphasis
- The flash effect consists of 3 flashes at 150ms intervals
- Decorations are automatically updated when:
  - The active notebook changes
  - Notebook content is modified
  - Text editors become visible (e.g., when scrolling)

## Screenshots

(Screenshots would be added here showing the feature in action)

## Tips

- Use the tag priority and color features in combination with scrollbar decorators for better organization
- The flash effect helps you quickly identify where selected tags are located, even in large notebooks
- Decorators persist across sessions as they're based on cell tags stored in notebook metadata
