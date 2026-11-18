// LLD §4.4 — transform-only timer movement. One element, centre-origin math, a CSS variable.
import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import type { Corner } from '@/core/types';

export type Placement = 'center' | 'overtime' | Corner;

export const COMPACT_SCALE = 0.28;
export const MARGIN_RATIO = 0.04;
/** In the full overtime screen the counter sits below the TIME UP! heading. */
export const OVERTIME_SCALE = 0.8;
export const OVERTIME_OFFSET_RATIO = 0.14;

const fmt = (n: number) => `${Math.round(n * 100) / 100}px`;

/**
 * Stage size W×H and the timer's natural (untransformed) box w×h → a transform with a FIXED
 * function list, so every placement interpolates smoothly from any other.
 */
export function computeTransform(W: number, H: number, w: number, h: number, placement: Placement): string {
    let dx = 0;
    let dy = 0;
    let k = 1;
    if (placement === 'overtime') {
        k = OVERTIME_SCALE;
        dy = H * OVERTIME_OFFSET_RATIO;
    } else if (placement !== 'center') {
        k = COMPACT_SCALE;
        const m = MARGIN_RATIO * Math.min(W, H);
        const x = W / 2 - m - (k * w) / 2;
        const y = H / 2 - m - (k * h) / 2;
        dx = placement === 'tl' || placement === 'bl' ? -x : x;
        dy = placement === 'tl' || placement === 'tr' ? -y : y;
    }
    return `translate(-50%, -50%) translate(${fmt(dx)}, ${fmt(dy)}) scale(${k})`;
}

/** Measures the stage and the timer box with a ResizeObserver and yields the transform. */
export function useTimerTransform(stage: Ref<HTMLElement | null>, timer: Ref<HTMLElement | null>, placement: Ref<Placement>) {
    const transform = ref(computeTransform(0, 0, 0, 0, 'center'));
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
        transform.value = computeTransform(size.W, size.H, size.w, size.h, placement.value);
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

    return { transform, measure };
}
