import * as vscode from 'vscode';

/** Hot red matching the tree view color picker preset */
export const DEFAULT_HOT_RGB = { r: 231, g: 76, b: 60 } as const;
export const DEFAULT_HOT_HEX = '#e74c3c';

const DEFAULT_FADE_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Below this opacity, treat as fully cooled and use the default ThemeIcon */
const MIN_VISIBLE_OPACITY = 0.08;

export interface HotIconStyle {
    color: string;
    opacity: number;
}

/**
 * Fade window in milliseconds from the fadeDays setting (default 30 days).
 */
export function getFadeMs(): number {
    try {
        const days = vscode.workspace.getConfiguration('jupyter-cell-tags').get<number>('tagHotColor.fadeDays', DEFAULT_FADE_DAYS);
        const safeDays = typeof days === 'number' && Number.isFinite(days) && days >= 1 ? days : DEFAULT_FADE_DAYS;
        return safeDays * MS_PER_DAY;
    } catch {
        return DEFAULT_FADE_DAYS * MS_PER_DAY;
    }
}

/**
 * Linear fade from opaque hot red toward clear based on tag age.
 * Returns undefined when the tag is fully cooled or createdAt is missing/invalid.
 * Uses hex + separate opacity (SVG fill-opacity) — more reliable than rgba() in tree icons.
 */
export function getHotIconStyle(createdAt: string | undefined, now: number = Date.now(), fadeMs: number = getFadeMs()): HotIconStyle | undefined {
    if (!createdAt) {
        return undefined;
    }
    const createdMs = Date.parse(createdAt);
    if (Number.isNaN(createdMs)) {
        return undefined;
    }
    const age = now - createdMs;
    if (age < 0 || age >= fadeMs) {
        return undefined;
    }
    const opacity = Math.max(0, Math.min(1, 1 - age / fadeMs));
    if (opacity < MIN_VISIBLE_OPACITY) {
        return undefined;
    }
    return { color: DEFAULT_HOT_HEX, opacity };
}

/** @deprecated Prefer getHotIconStyle; kept for simple string consumers */
export function getHotIconColor(createdAt: string | undefined, now: number = Date.now()): string | undefined {
    const style = getHotIconStyle(createdAt, now);
    if (!style) {
        return undefined;
    }
    // Encode opacity into an 8-digit hex (#RRGGBBAA) for single-string SVG fills
    const alpha = Math.round(style.opacity * 255).toString(16).padStart(2, '0');
    return `${style.color}${alpha}`;
}

export { DEFAULT_FADE_DAYS };
