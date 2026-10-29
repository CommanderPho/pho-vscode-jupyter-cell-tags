# *Extended* Jupyter Cell Tags support in VS Code

This extension provides extended support for notebook cell tags, cell run groups, and related notebook navigation tools in Visual Studio Code.

I needed more functionality and was tired of fussing with the Jupyter/VS Code/Powertoys version hell, so I forked the official tags extension and implemented it myself. My pull request on the official repo is here: https://github.com/microsoft/vscode-jupyter-cell-tags/pull/40, but there seems to be no progress on merging it.

After this, I added custom run groups to work around https://github.com/microsoft/vscode-jupyter-powertoys/issues/90. Tags can be named freely; tags that start with the `run-` prefix appear first in the run list.

This fork is available on the marketplace here:

```
Name: Pho Jupyter Cell Tags
Id: phohale.pho-vscode-jupyter-cell-tags
Description: Extended Jupyter Cell Tags support for VS Code
Version: 0.7.2
Publisher: PhoHale
VS Marketplace Link: https://marketplace.visualstudio.com/items?itemName=PhoHale.pho-vscode-jupyter-cell-tags
```

Source: https://github.com/CommanderPho/vscode-jupyter-cell-tags

This extension replaces the tags extension that ships with the [Jupyter extension for Visual Studio Code](https://marketplace.visualstudio.com/items?itemName=ms-toolsai.jupyter). After Jupyter is installed as a dependency, this extension uninstalls the official Microsoft **Jupyter Cell Tags** pack member (`ms-toolsai.vscode-jupyter-cell-tags`). Reload the window if prompted.

### Features

- Add a tag to the current cell from the Command Palette (**Add Tag to Cell**) or from **+ Tag** on the cell ![Add cell tag](images/add-cell-tag.png)
- Manage tags in the **Cell Tags** and **All Notebook Tags** views ![Cell tags view](images/cell-tags-view.png)
- Edit notebook tag metadata as JSON (**Edit Cell Tags (JSON)**) ![Cell tags json](images/cell-tags-json.png)
- **Execute Tag Run Group** runs every cell that has a chosen tag. Tags that start with `run-` appear first in the list.
- Color, rename, sort, and remove tags from all cells in the All Notebook Tags view
- **Jumpbacks** bookmark a cell or text line and jump back to it
- **Custom NB Outline** lists markdown headings with multi-select
- **Executed Cells** lists cells run in this session
- **Git Modified Cells** lists cells changed vs HEAD (or a chosen commit) and can highlight them
- **Dependency Chain** finds upstream Python cells required to run the current cell
- **Notebook Cell Filter** collapses cells that do not match chosen criteria, or opens matching cells (without outputs) in a read-only tab
- **Durable Jupyter** starts a local Jupyter server that survives Extension Host restart
- Each of these can be turned on or off under **Features** in settings

### License

MIT. This project is a fork of Microsoft Jupyter Cell Tags. Use of Microsoft trademarks follows [Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
