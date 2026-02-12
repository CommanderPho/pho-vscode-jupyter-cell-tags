import * as vscode from 'vscode';
import { getCellTags } from '../helper';
import { TagPropertiesManager } from '../tagProperties/tagPropertiesManager';
import { log } from '../util/logging';

/**
 * Manages scrollbar decorations for notebook cells based on their tags.
 * Shows colored markers in the scrollbar for cells with tags, and emphasizes
 * selected tags with thicker decorations and flash effects.
 */
export class ScrollbarDecoratorManager {
    private static readonly FLASH_COUNT = 3;
    private static readonly FLASH_DURATION_MS = 150;

    private decorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();
    private emphasisDecorationType: vscode.TextEditorDecorationType | undefined;
    private currentNotebook: vscode.NotebookDocument | undefined;
    private isEnabled: boolean = true;
    private selectedTag: string | undefined;
    private disposables: vscode.Disposable[] = [];

    constructor(context: vscode.ExtensionContext) {
        // Read configuration
        this.updateConfiguration();

        // Listen for configuration changes
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('jupyter-cell-tags.scrollbarDecorators.enabled')) {
                    this.updateConfiguration();
                }
            })
        );

        // Listen for notebook changes
        this.disposables.push(
            vscode.window.onDidChangeActiveNotebookEditor(editor => {
                if (editor && editor.notebook.notebookType === 'jupyter-notebook') {
                    this.currentNotebook = editor.notebook;
                    this.updateAllDecorations();
                } else {
                    this.currentNotebook = undefined;
                    this.clearAllDecorations();
                }
            })
        );

        this.disposables.push(
            vscode.workspace.onDidChangeNotebookDocument(e => {
                if (this.currentNotebook && e.notebook.uri.toString() === this.currentNotebook.uri.toString()) {
                    this.updateAllDecorations();
                }
            })
        );

        // Listen for visible text editors changing (important for applying decorations to newly visible cells)
        this.disposables.push(
            vscode.window.onDidChangeVisibleTextEditors(() => {
                if (this.isEnabled) {
                    this.updateAllDecorations();
                }
            })
        );

        // Initialize with current notebook if available
        if (vscode.window.activeNotebookEditor?.notebook.notebookType === 'jupyter-notebook') {
            this.currentNotebook = vscode.window.activeNotebookEditor.notebook;
            this.updateAllDecorations();
        }
    }

    private updateConfiguration(): void {
        const config = vscode.workspace.getConfiguration('jupyter-cell-tags');
        const wasEnabled = this.isEnabled;
        this.isEnabled = config.get<boolean>('scrollbarDecorators.enabled', true);

        if (wasEnabled && !this.isEnabled) {
            // Feature was disabled, clear decorations
            this.clearAllDecorations();
        } else if (!wasEnabled && this.isEnabled) {
            // Feature was enabled, update decorations
            this.updateAllDecorations();
        }
    }

    /**
     * Gets or creates a decoration type for a tag with the specified color.
     */
    private getOrCreateDecorationType(tag: string, color: string, isEmphasis: boolean = false): vscode.TextEditorDecorationType {
        if (isEmphasis) {
            // Create temporary emphasis decoration (thicker)
            return vscode.window.createTextEditorDecorationType({
                overviewRulerColor: color,
                overviewRulerLane: vscode.OverviewRulerLane.Full,
            });
        }

        // Return existing decoration if available
        if (this.decorationTypes.has(tag)) {
            return this.decorationTypes.get(tag)!;
        }

        // Create new decoration type
        const decorationType = vscode.window.createTextEditorDecorationType({
            overviewRulerColor: color,
            overviewRulerLane: vscode.OverviewRulerLane.Center,
        });

        this.decorationTypes.set(tag, decorationType);
        return decorationType;
    }

    /**
     * Generates a color for a tag based on its properties or a hash of its name.
     */
    private getColorForTag(tag: string): string {
        if (!this.currentNotebook) {
            return this.hashStringToColor(tag);
        }

        // Try to get color from tag properties
        const properties = TagPropertiesManager.getTagProperties(this.currentNotebook, tag);
        if (properties?.color) {
            return properties.color;
        }

        // Fall back to hash-based color
        return this.hashStringToColor(tag);
    }

    /**
     * Generates a color from a string using a simple hash function.
     */
    private hashStringToColor(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        // Convert to 32-bit integer
        hash |= 0;

        // Generate RGB values with good saturation and brightness
        const r = Math.abs((hash >> 0) & 0xFF);
        const g = Math.abs((hash >> 8) & 0xFF);
        const b = Math.abs((hash >> 16) & 0xFF);

        // Ensure colors are vibrant (adjust saturation and brightness)
        const hsl = this.rgbToHsl(r, g, b);
        hsl.s = Math.max(0.5, hsl.s); // Minimum 50% saturation
        hsl.l = Math.min(0.7, Math.max(0.4, hsl.l)); // Keep lightness between 40-70%

        const rgb = this.hslToRgb(hsl.h, hsl.s, hsl.l);
        return this.rgbToHex(rgb.r, rgb.g, rgb.b);
    }

    private rgbToHex(r: number, g: number, b: number): string {
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

    private rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
        r /= 255;
        g /= 255;
        b /= 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h = 0, s = 0, l = (max + min) / 2;

        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }

        return { h, s, l };
    }

    private hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
        let r, g, b;

        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p: number, q: number, t: number) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };

            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }

        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255)
        };
    }

    /**
     * Updates all decorations for the current notebook.
     */
    private updateAllDecorations(): void {
        if (!this.isEnabled || !this.currentNotebook) {
            return;
        }

        const notebook = this.currentNotebook;
        const tagToCells: Map<string, number[]> = new Map();

        // Collect all tags and their cell indices
        for (let i = 0; i < notebook.cellCount; i++) {
            const cell = notebook.cellAt(i);
            const tags = getCellTags(cell);
            
            tags.forEach(tag => {
                if (!tagToCells.has(tag)) {
                    tagToCells.set(tag, []);
                }
                tagToCells.get(tag)!.push(i);
            });
        }

        // Apply decorations for each tag
        tagToCells.forEach((cellIndices, tag) => {
            this.updateDecorationsForTag(tag, cellIndices);
        });

        // Remove decorations for tags that no longer exist
        const currentTags = Array.from(tagToCells.keys());
        this.decorationTypes.forEach((_, tag) => {
            if (!currentTags.includes(tag)) {
                this.clearDecorationsForTag(tag);
            }
        });
    }

    /**
     * Updates decorations for a specific tag.
     */
    private updateDecorationsForTag(tag: string, cellIndices: number[]): void {
        if (!this.currentNotebook) {
            return;
        }

        const color = this.getColorForTag(tag);
        const decorationType = this.getOrCreateDecorationType(tag, color);
        
        // Apply decorations to all text editors for cells with this tag
        const notebook = this.currentNotebook;
        cellIndices.forEach(cellIndex => {
            const cell = notebook.cellAt(cellIndex);
            const cellUri = cell.document.uri.toString();
            
            // Find the text editor for this cell
            const textEditor = vscode.window.visibleTextEditors.find(
                e => e.document.uri.toString() === cellUri
            );

            if (textEditor) {
                const fullRange = this.getCellFullRange(textEditor.document);
                textEditor.setDecorations(decorationType, [fullRange]);
            }
        });
    }

    /**
     * Clears decorations for a specific tag.
     */
    private clearDecorationsForTag(tag: string): void {
        const decorationType = this.decorationTypes.get(tag);
        if (decorationType) {
            decorationType.dispose();
            this.decorationTypes.delete(tag);
        }
    }

    /**
     * Clears all decorations.
     */
    private clearAllDecorations(): void {
        this.decorationTypes.forEach(decorationType => {
            decorationType.dispose();
        });
        this.decorationTypes.clear();

        if (this.emphasisDecorationType) {
            this.emphasisDecorationType.dispose();
            this.emphasisDecorationType = undefined;
        }
    }

    /**
     * Emphasizes decorations for a selected tag with thicker markers and flash effect.
     */
    public async emphasizeTag(tag: string): Promise<void> {
        if (!this.isEnabled || !this.currentNotebook) {
            return;
        }

        this.selectedTag = tag;
        const notebook = this.currentNotebook;
        const cellIndices: number[] = [];

        // Find all cells with this tag
        for (let i = 0; i < notebook.cellCount; i++) {
            const cell = notebook.cellAt(i);
            const tags = getCellTags(cell);
            if (tags.includes(tag)) {
                cellIndices.push(i);
            }
        }

        if (cellIndices.length === 0) {
            return;
        }

        const color = this.getColorForTag(tag);

        // Create emphasis decoration (thicker)
        const emphasisDecoType = this.getOrCreateDecorationType(tag, color, true);

        // Apply flash effect
        await this.flashDecorations(cellIndices, emphasisDecoType);

        // Dispose emphasis decoration after flash
        emphasisDecoType.dispose();
    }

    /**
     * Clears emphasis on the currently selected tag.
     */
    public clearEmphasis(): void {
        if (this.emphasisDecorationType) {
            this.emphasisDecorationType.dispose();
            this.emphasisDecorationType = undefined;
        }
        this.selectedTag = undefined;
    }

    /**
     * Applies a flash effect to decorations.
     */
    private async flashDecorations(
        cellIndices: number[],
        decorationType: vscode.TextEditorDecorationType
    ): Promise<void> {
        if (!this.currentNotebook) {
            return;
        }

        const notebook = this.currentNotebook;

        for (let i = 0; i < ScrollbarDecoratorManager.FLASH_COUNT; i++) {
            // Show emphasis
            cellIndices.forEach(cellIndex => {
                const cell = notebook.cellAt(cellIndex);
                const cellUri = cell.document.uri.toString();
                const textEditor = vscode.window.visibleTextEditors.find(
                    e => e.document.uri.toString() === cellUri
                );

                if (textEditor) {
                    const fullRange = this.getCellFullRange(textEditor.document);
                    textEditor.setDecorations(decorationType, [fullRange]);
                }
            });

            await this.delay(ScrollbarDecoratorManager.FLASH_DURATION_MS);

            // Hide emphasis
            cellIndices.forEach(cellIndex => {
                const cell = notebook.cellAt(cellIndex);
                const cellUri = cell.document.uri.toString();
                const textEditor = vscode.window.visibleTextEditors.find(
                    e => e.document.uri.toString() === cellUri
                );

                if (textEditor) {
                    textEditor.setDecorations(decorationType, []);
                }
            });

            await this.delay(ScrollbarDecoratorManager.FLASH_DURATION_MS);
        }
    }

    private getCellFullRange(document: vscode.TextDocument): vscode.Range {
        if (document.lineCount === 0) {
            return new vscode.Range(0, 0, 0, 0);
        }
        const lastLine = document.lineCount - 1;
        return new vscode.Range(0, 0, lastLine, document.lineAt(lastLine).text.length);
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    public dispose(): void {
        this.clearAllDecorations();
        this.disposables.forEach(d => d.dispose());
    }
}
