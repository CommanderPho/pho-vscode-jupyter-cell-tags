import * as vscode from 'vscode';
import { getCellTags } from '../helper';
import { TagPropertiesManager } from '../tagProperties/tagPropertiesManager';
import { isFeatureEnabled } from '../util/featureFlags';
import { log } from '../util/logging';

/**
 * Manages scrollbar decorations for notebook cells based on their tags.
 * Hot-path listeners are registered only while the feature is enabled.
 */
export class ScrollbarDecoratorManager implements vscode.Disposable {
    private static readonly FLASH_COUNT = 3;
    private static readonly FLASH_DURATION_MS = 150;
    private static readonly UPDATE_DEBOUNCE_MS = 200;

    private decorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();
    private emphasisDecorationType: vscode.TextEditorDecorationType | undefined;
    private currentNotebook: vscode.NotebookDocument | undefined;
    private isEnabled: boolean = false;
    private selectedTag: string | undefined;
    private readonly configDisposables: vscode.Disposable[] = [];
    private hotDisposables: vscode.Disposable[] = [];
    private updateTimer: ReturnType<typeof setTimeout> | undefined;
    private disposed = false;

    constructor(_context: vscode.ExtensionContext) {
        this.configDisposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('jupyter-cell-tags.features.scrollbarDecorators')) {
                    this.syncEnabledState();
                }
            })
        );
        this.syncEnabledState();
    }

    private syncEnabledState(): void {
        if (this.disposed) {
            return;
        }
        const wantEnabled = isFeatureEnabled('scrollbarDecorators');
        if (wantEnabled === this.isEnabled && (wantEnabled ? this.hotDisposables.length > 0 : this.hotDisposables.length === 0)) {
            return;
        }

        if (wantEnabled) {
            this.isEnabled = true;
            this.attachHotListeners();
            if (vscode.window.activeNotebookEditor?.notebook.notebookType === 'jupyter-notebook') {
                this.currentNotebook = vscode.window.activeNotebookEditor.notebook;
            }
            this.scheduleUpdateAllDecorations();
            log('Scrollbar decorators enabled');
        } else {
            this.isEnabled = false;
            this.detachHotListeners();
            this.clearAllDecorations();
            this.currentNotebook = undefined;
            log('Scrollbar decorators disabled (hot listeners disposed)');
        }
    }

    private attachHotListeners(): void {
        this.detachHotListeners();
        this.hotDisposables.push(
            vscode.window.onDidChangeActiveNotebookEditor(editor => {
                if (editor && editor.notebook.notebookType === 'jupyter-notebook') {
                    this.currentNotebook = editor.notebook;
                    this.scheduleUpdateAllDecorations();
                } else {
                    this.currentNotebook = undefined;
                    this.clearAllDecorations();
                }
            }),
            vscode.workspace.onDidChangeNotebookDocument(e => {
                if (!this.currentNotebook || e.notebook.uri.toString() !== this.currentNotebook.uri.toString()) {
                    return;
                }
                // Skip output/execution-only noise when tags cannot have changed
                if (!notebookChangeMayAffectTags(e)) {
                    return;
                }
                this.scheduleUpdateAllDecorations();
            }),
            vscode.window.onDidChangeVisibleTextEditors(() => {
                this.scheduleUpdateAllDecorations();
            })
        );
    }

    private detachHotListeners(): void {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
            this.updateTimer = undefined;
        }
        this.hotDisposables.forEach(d => d.dispose());
        this.hotDisposables = [];
    }

    private scheduleUpdateAllDecorations(): void {
        if (!this.isEnabled) {
            return;
        }
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }
        this.updateTimer = setTimeout(() => {
            this.updateTimer = undefined;
            this.updateAllDecorations();
        }, ScrollbarDecoratorManager.UPDATE_DEBOUNCE_MS);
    }

    private getOrCreateDecorationType(tag: string, color: string, isEmphasis: boolean = false): vscode.TextEditorDecorationType {
        if (isEmphasis) {
            return vscode.window.createTextEditorDecorationType({
                overviewRulerColor: color,
                overviewRulerLane: vscode.OverviewRulerLane.Full,
            });
        }

        if (this.decorationTypes.has(tag)) {
            return this.decorationTypes.get(tag)!;
        }

        const decorationType = vscode.window.createTextEditorDecorationType({
            overviewRulerColor: color,
            overviewRulerLane: vscode.OverviewRulerLane.Center,
        });

        this.decorationTypes.set(tag, decorationType);
        return decorationType;
    }

    private getColorForTag(tag: string): string {
        if (!this.currentNotebook) {
            return this.hashStringToColor(tag);
        }

        const properties = TagPropertiesManager.getTagProperties(this.currentNotebook, tag);
        if (properties?.color) {
            return properties.color;
        }

        return this.hashStringToColor(tag);
    }

    private hashStringToColor(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }

        const r = Math.abs((hash >> 0) & 0xFF);
        const g = Math.abs((hash >> 8) & 0xFF);
        const b = Math.abs((hash >> 16) & 0xFF);

        const hsl = this.rgbToHsl(r, g, b);
        hsl.s = Math.max(0.5, hsl.s);
        hsl.l = Math.min(0.7, Math.max(0.4, hsl.l));

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
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };

            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }

        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255)
        };
    }

    private updateAllDecorations(): void {
        if (!this.isEnabled || !this.currentNotebook) {
            return;
        }

        const notebook = this.currentNotebook;
        const tagToCells: Map<string, number[]> = new Map();

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

        tagToCells.forEach((cellIndices, tag) => {
            this.updateDecorationsForTag(tag, cellIndices);
        });

        const currentTags = Array.from(tagToCells.keys());
        this.decorationTypes.forEach((_, tag) => {
            if (!currentTags.includes(tag)) {
                this.clearDecorationsForTag(tag);
            }
        });
    }

    private updateDecorationsForTag(tag: string, cellIndices: number[]): void {
        if (!this.currentNotebook) {
            return;
        }

        const color = this.getColorForTag(tag);
        const decorationType = this.getOrCreateDecorationType(tag, color);

        const notebook = this.currentNotebook;
        const uriToEditor = new Map(
            vscode.window.visibleTextEditors.map(e => [e.document.uri.toString(), e] as const)
        );

        cellIndices.forEach(cellIndex => {
            const cell = notebook.cellAt(cellIndex);
            const textEditor = uriToEditor.get(cell.document.uri.toString());

            if (textEditor) {
                const fullRange = this.getCellFullRange(textEditor.document);
                textEditor.setDecorations(decorationType, [fullRange]);
            }
        });
    }

    private clearDecorationsForTag(tag: string): void {
        const decorationType = this.decorationTypes.get(tag);
        if (decorationType) {
            decorationType.dispose();
            this.decorationTypes.delete(tag);
        }
    }

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

    public async emphasizeTag(tag: string): Promise<void> {
        if (!this.isEnabled || !this.currentNotebook) {
            return;
        }

        this.selectedTag = tag;
        const notebook = this.currentNotebook;
        const cellIndices: number[] = [];

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
        const emphasisDecoType = this.getOrCreateDecorationType(tag, color, true);
        await this.flashDecorations(cellIndices, emphasisDecoType);
        emphasisDecoType.dispose();
    }

    public clearEmphasis(): void {
        if (this.emphasisDecorationType) {
            this.emphasisDecorationType.dispose();
            this.emphasisDecorationType = undefined;
        }
        this.selectedTag = undefined;
    }

    private getTextEditorForCell(cellIndex: number): vscode.TextEditor | undefined {
        if (!this.currentNotebook) {
            return undefined;
        }

        const cell = this.currentNotebook.cellAt(cellIndex);
        const cellUri = cell.document.uri.toString();
        return vscode.window.visibleTextEditors.find(
            e => e.document.uri.toString() === cellUri
        );
    }

    private async flashDecorations(
        cellIndices: number[],
        decorationType: vscode.TextEditorDecorationType
    ): Promise<void> {
        if (!this.currentNotebook) {
            return;
        }

        for (let i = 0; i < ScrollbarDecoratorManager.FLASH_COUNT; i++) {
            cellIndices.forEach(cellIndex => {
                const textEditor = this.getTextEditorForCell(cellIndex);
                if (textEditor) {
                    const fullRange = this.getCellFullRange(textEditor.document);
                    textEditor.setDecorations(decorationType, [fullRange]);
                }
            });

            await this.delay(ScrollbarDecoratorManager.FLASH_DURATION_MS);

            cellIndices.forEach(cellIndex => {
                const textEditor = this.getTextEditorForCell(cellIndex);
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
        this.disposed = true;
        this.detachHotListeners();
        this.clearAllDecorations();
        this.configDisposables.forEach(d => d.dispose());
    }
}

/** True when notebook change could alter cell tags or structure used by scrollbar markers. */
function notebookChangeMayAffectTags(e: vscode.NotebookDocumentChangeEvent): boolean {
    if (e.contentChanges.length > 0) {
        return true;
    }
    for (const change of e.cellChanges) {
        if (change.document || change.metadata) {
            return true;
        }
    }
    return false;
}
