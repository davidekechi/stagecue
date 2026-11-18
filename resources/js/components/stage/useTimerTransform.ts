// LLD §4.4 — transform-only timer movement. One element, centre-origin math, a CSS variable.
// The full-size timer FILLS the stage: digits up to ~70% of the height, never wider than the safe area.
import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import type { Corner } from '@/core/types';

export type Placement = 'center' | 'overtime' | Corner;

/** Target height of the digits as a share of the stage height (full-size timer). */
export const DIGIT_HEIGHT_RATIO = 0.7;
/** Bricolage Grotesque's figure height as a share of the font size (wght 800, wdth 75). */
export const DIGIT_CAP_RATIO = 0.673;
/**
 * Condensed bold digits on a 16:9 screen run out of WIDTH before they reach 70% height
 * ("15:00" ≈ 58%). The full-size timer is then stretched vertically, never more than this,
 * so long readouts ("1:00:00") are not distorted.
 */
export const MAX_STRETCH = 1.4;
/** The full-size timer may use this share of the stage width (5% safe area each side). */
export const WIDTH_RATIO = 0.9;
/** Compact (corner) timer: box height as a share of the stage height. */
export const COMPACT_HEIGHT_RATIO = 0.08;
export const MARGIN_RATIO = 0.04;
/** Overtime counter under the big TIME UP!: box height share, and where its centre sits. */
export const OVERTIME_HEIGHT_RATIO = 0.15;
export const OVERTIME_CENTER_RATIO = 0.66;

const fmt = (n: number) => `${Math.round(n * 100) / 100}px`;

/** The largest font size (px) that keeps the readout within 70% height and the safe width. */
export function fitFontSize(W: number, H: number, widthPerEm: number): number {
    const byHeight = (DIGIT_HEIGHT_RATIO * H) / DIGIT_CAP_RATIO;
    if (!(widthPerEm > 0)) return byHeight;
    return Math.min(byHeight, (WIDTH_RATIO * W) / widthPerEm);
}

/** Vertical stretch for the full-size timer so the digits approach 70% of the height (capped). */
export function stretchFor(H: number, fontPx: number | null, placement: Placement): number {
    if (placement !== 'center' || !fontPx || H <= 0) return 1;
    const digits = fontPx * DIGIT_CAP_RATIO;
    return Math.round(Math.min(MAX_STRETCH, Math.max(1, (DIGIT_HEIGHT_RATIO * H) / digits)) * 1000) / 1000;
}

/**
 * Stage size W×H and the timer's natural (untransformed) box w×h → a transform with a FIXED
 * function list, so every placement interpolates smoothly from any other. The corner and
 * overtime sizes are fractions of the STAGE, so they stay constant however big the full timer is.
 */
export function computeTransform(W: number, H: number, w: number, h: number, placement: Placement): string {
    let dx = 0;
    let dy = 0;
    let k = 1;
    if (h > 0 && placement === 'overtime') {
        k = Math.min(1, (OVERTIME_HEIGHT_RATIO * H) / h);
        dy = H * (OVERTIME_CENTER_RATIO - 0.5);
    } else if (h > 0 && placement !== 'center') {
        k = Math.min(1, (COMPACT_HEIGHT_RATIO * H) / h);
        const m = MARGIN_RATIO * Math.min(W, H);
        const x = W / 2 - m - (k * w) / 2;
        const y = H / 2 - m - (k * h) / 2;
        dx = placement === 'tl' || placement === 'bl' ? -x : x;
        dy = placement === 'tl' || placement === 'tr' ? -y : y;
    }
    return `translate(-50%, -50%) translate(${fmt(dx)}, ${fmt(dy)}) scale(${Math.round(k * 10000) / 10000})`;
}

/** The readout's "shape" (digits → 0), so the font is refitted only when the format changes. */
export const textShape = (text: string) => text.replace(/\d/g, '0');

/** Measures the stage and the timer box, fits the font, and yields the transform. */
export function useTimerTransform(stage: Ref<HTMLElement | null>, timer: Ref<HTMLElement | null>, placement: Ref<Placement>, shape: Ref<string>) {
    const transform = ref(computeTransform(0, 0, 0, 0, 'center'));
    const fontPx = ref<number | null>(null);
    const stretch = ref(1);
    const size = { W: 0, H: 0, w: 0, h: 0 };
    let observer: ResizeObserver | null = null;

    const measure = () => {
        const s = stage.value;
        const t = timer.value;
        if (s) {
            size.W = s.clientWidth;
            size.H = s.clientHeight;
        }
        if (t) {
            // offsetWidth/Height ignore transforms: this is the natural box.
            size.w = t.offsetWidth;
            size.h = t.offsetHeight;
        }
        if (size.W > 0 && size.H > 0) {
            const current = fontPx.value ?? (t ? parseFloat(getComputedStyle(t).fontSize) : 0);
            const perEm = current > 0 && size.w > 0 ? size.w / current : 0;
            const next = fitFontSize(size.W, size.H, perEm);
            if (fontPx.value === null || Math.abs(next - fontPx.value) > 0.5) fontPx.value = next; // → resize → measure again
        }
        transform.value = computeTransform(size.W, size.H, size.w, size.h, placement.value);
        stretch.value = stretchFor(size.H, fontPx.value, placement.value);
    };

    onMounted(() => {
        measure();
        if (typeof ResizeObserver !== 'undefined') {
            observer = new ResizeObserver(measure);
            if (stage.value) observer.observe(stage.value);
            if (timer.value) observer.observe(timer.value);
        }
    });
    watch(timer, (el, old) => {
        if (old) observer?.unobserve(old);
        if (el) observer?.observe(el);
        measure();
    });
    watch(placement, measure);
    onBeforeUnmount(() => observer?.disconnect());
    // A new format (e.g. 59:59 → 1:00:00 or overtime) has a new width: refit.
    watch(shape, () => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(measure) : measure()));

    return { transform, fontPx, stretch, measure };
}
