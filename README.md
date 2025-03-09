# *Extended* Jupyter Cell Tags support in VS Code

This extension provides extended support for notebook cell tags and cell run groups in Visual Studio Code.

I needed more functionality and was tired of fussing with the Jupter/VSCode/Powertoys version hell, so I forked the repo implemented it myself. My pull request on the official repo is here: https://github.com/microsoft/vscode-jupyter-cell-tags/pull/40, but there seems to be no progress on merging it.

After this, I added custom run groups to work around https://github.com/microsoft/vscode-jupyter-powertoys/issues/90 and believe I improved the expierence (at least for myself) over the Jupyter Powertoys version, as it allows an arbitrary number of run groups with custom names.

This fork is available on marketplace here:
```
Name: Pho Jupyter Cell Tags
Id: phohale.pho-vscode-jupyter-cell-tags
Description: Extended Jupyter Cell Tags support for VS Code
Version: 0.3.6
Publisher: PhoHale
VS Marketplace Link: https://marketplace.visualstudio.com/items?itemName=PhoHale.pho-vscode-jupyter-cell-tags
```
or via github https://github.com/CommanderPho/vscode-jupyter-cell-tags here

### Features:
- Add a tag to the cell you're on by opening the Command Palette (`Cmd+Shift+P`) and selecting **Add Cell Tag** or by clicking **+ Tag** on the cell ![Add cell tag](images/add-cell-tag.png)
- Add multiple tags to the cell you're on by opening the Command Palette (`Cmd+Shift+P`) and selecting **Jupyter: Focus on Cell Tags View** and clicking on **+** ![Cell tags view](images/cell-tags-view.png)
- Modify tags in the notebook's metadata (JSON format) by opening the Command Palette (`Cmd+Shift+P`) and selecting **Edit Cell Tags (JSON)** or by clicking out to it from the Cell Tags View ![Cell tags json](images/cell-tags-json.png)
- Cell Run Groups allow you to execute all cells with a given tag. You can select tags to run from the menu **Excecute Tag Run Group** or via the similarily named command.
    Tags that start with the "run-" prefix will appear first in the run list. ![Image](https://github.com/user-attachments/assets/9640d8f3-63e0-4fd9-9b9c-95c74eb8fa9d)
    ![Image](https://github.com/user-attachments/assets/faefdc03-274f-49c5-a7b4-e8b4680d942b)
    ![Image](https://github.com/user-attachments/assets/12ed2764-768a-4cce-b4d4-0e49a4b560b3)
- More undocumented commands available in the menus, documentation coming soon.


This extension replaces the forked extension that comes with the [Jupyter extension for Visual Studio Code](https://marketplace.visualstudio.com/items?itemName=phohale.jupyter). You must first uninstall the official Microsoft version before installing this one.



## Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.opensource.microsoft.com.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft
trademarks or logos is subject to and must follow
[Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
Any use of third-party trademarks or logos are subject to those third-party's policies.




## Required Includes:

# launch.json:
```json
...
{
    "name": "Run Extension",
    "type": "extensionHost",
    "request": "launch",
    "args": [
        "--extensionDevelopmentPath=${workspaceFolder}",
        "--enable-proposed-api",
        "phohale.jupyter"
    ],
    "outFiles": [
        "${workspaceFolder}/out/**/*.js"
    ],
    "preLaunchTask": "${defaultBuildTask}",
},
...
```

## Program Arguments: ` --enable-proposed-api phohale.jupyter`
```
 --enable-proposed-api phohale.jupyter
```

For example on Windows, my arguments are: `K:\FastSwap\AppData\VSCode\green\bin\VSCode\Code.exe --max-old-space-size=8192 --enable-proposed-api phohale.jupyter`




--enable-proposed-api notebookCellExecutionState


## Potential Emoji:

🎛️🎚️📃🗞️🧾🖼️🎐
🔦🔗⚓
🧰
↪️↩️↩️
⤵️⤴️🔙
❇️
🦘🥏🎯
🐛🔖➖➕
Error: 🐛‼️ ❌


## 2025-02-25 - on macOS, I had to remove `nodenv` from path (an alternative to `nvm` for managing node versions) and move `nvm` up onto path. Also ahve to run with `zsh` instead of `bash`.

# 2025-02-26 - IMPORTANT - Finally got extension debugging working reliably

https://vscode.dev/editor/profile/github/62d11f2ed58b3e59527093d8318c1847

In `.vscode\launch.json`, I had to add a fixed extension debugging profile: `"--profile=PhoExtensionDev2025",`
```json
		{
			"name": "Run Extension",
			"type": "extensionHost",
			"request": "launch",
			"args": [
                // "--profile-temp",
				"--profile=PhoExtensionDev2025",
				"--extensionDevelopmentPath=${workspaceFolder}",
                // "--disable-extensions",
                "--enable-proposed-api",
                "phohale.jupyter"
			],
			"outFiles": [
				"${workspaceFolder}/out/**/*.js"
			],
			"preLaunchTask": "${defaultBuildTask}",
		},

```


# 2025-03-08 - Reference on Developing a VSCode Extension that uses the Jupyter Extension:
https://github.com/Microsoft/vscode-jupyter/blob/main/CONTRIBUTING.md#development-process
