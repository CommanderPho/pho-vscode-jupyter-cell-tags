# Product Overview

This is a VS Code extension that provides extended Jupyter notebook cell tagging functionality. It's a fork of Microsoft's original jupyter-cell-tags extension with significant enhancements.

## Core Features

- Add, edit, and manage tags on Jupyter notebook cells
- Cell Run Groups: Execute all cells with a specific tag
- Tag-based cell organization and navigation
- Jumpbacks: Bookmark cells for quick navigation
- Cell heading manipulation (increase/decrease depth)
- Tag import/export functionality
- All Notebook Tags view for workspace-wide tag management

## Key Differentiators

- Supports arbitrary number of custom-named run groups (vs limited predefined groups)
- Tags prefixed with "run-" appear first in execution lists
- Enhanced UI with tree views for tags and jumpbacks
- Conditional features (error navigation, jumpbacks) can be toggled via settings

## Extension Dependencies

Requires the official Jupyter extension (`ms-toolsai.jupyter`) and must replace the built-in Microsoft cell tags extension.
