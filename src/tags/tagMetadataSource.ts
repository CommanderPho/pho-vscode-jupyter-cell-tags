export class TagMetadataSource {
    private tagMetadata: Map<string, TagMetadata>;

    public static load(notebook: vscode.NotebookDocument): TagMetadataSource {
        const metadata = (notebook.metadata || {}) as { tagMetadata?: Record<string, TagMetadata> };
        return new TagMetadataSource(new Map(Object.entries(metadata.tagMetadata || {})));
    }

    public async persist(notebook: vscode.NotebookDocument): Promise<void> {
        const metadata = (notebook.metadata || {}) as { tagMetadata?: Record<string, TagMetadata> };
        metadata.tagMetadata = Object.fromEntries(this.tagMetadata);
        const edit = new vscode.WorkspaceEdit();
        await vscode.workspace.applyEdit(edit);
    }

    public setPriority(tagName: string, priority: number): void {
        const metadata = this.tagMetadata.get(tagName) || { name: tagName, priority: 0 };
        metadata.priority = priority;
        this.tagMetadata.set(tagName, metadata);
    }
}
