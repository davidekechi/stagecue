// LLD §4.5 — Window Management API screen picker (Chromium, progressive enhancement).

export interface ScreenInfo {
    label: string;
    width: number;
    height: number;
    isPrimary: boolean;
    isCurrent: boolean;
    /** The ScreenDetailed object to pass to requestFullscreen({ screen }). */
    handle: unknown;
}

export type ScreenListResult = { ok: true; screens: ScreenInfo[] } | { ok: false; reason: 'unsupported' | 'denied' };

interface ScreenDetailedLike {
    label?: string;
    width: number;
    height: number;
    isPrimary?: boolean;
}
interface ScreenDetailsLike {
    screens: ScreenDetailedLike[];
    currentScreen?: ScreenDetailedLike;
}
type WindowLike = { getScreenDetails?: () => Promise<ScreenDetailsLike> };

export const FALLBACK_TEXT = 'Drag this window onto the TV, then press F (or use “Fullscreen”).';

export function isScreenPickerSupported(win: WindowLike = globalThis as unknown as WindowLike): boolean {
    return typeof win.getScreenDetails === 'function';
}

export async function listScreens(win: WindowLike = globalThis as unknown as WindowLike): Promise<ScreenListResult> {
    if (!isScreenPickerSupported(win)) return { ok: false, reason: 'unsupported' };
    try {
        const details = await win.getScreenDetails!();
        return {
            ok: true,
            screens: details.screens.map((s, i) => ({
                label: s.label?.trim() || `Screen ${i + 1}`,
                width: s.width,
                height: s.height,
                isPrimary: !!s.isPrimary,
                isCurrent: s === details.currentScreen,
                handle: s,
            })),
        };
    } catch {
        // NotAllowedError when the permission prompt is denied.
        return { ok: false, reason: 'denied' };
    }
}
