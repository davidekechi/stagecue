<script setup lang="ts">
// LLD §4.4 / FR-R7 — the largest font size that fits, by binary search (8 iterations).
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = withDefaults(
    defineProps<{
        text: string;
        /** Bounds as fractions of the box height. 4% is the minimum readable size. */
        minRatio?: number;
        maxRatio?: number;
        iterations?: number;
    }>(),
    { minRatio: 0.04, maxRatio: 0.4, iterations: 10 },
);

const box = ref<HTMLElement | null>(null);
const inner = ref<HTMLElement | null>(null);
const fontSize = ref<number | null>(null);
let raf = 0;
let observer: ResizeObserver | null = null;

function fits(): boolean {
    const b = box.value!;
    return b.scrollHeight <= b.clientHeight && b.scrollWidth <= b.clientWidth;
}

function fit(): void {
    const b = box.value;
    if (!b || !inner.value) return;
    const H = b.clientHeight;
    if (H <= 0) return;
    let lo = H * props.minRatio;
    let hi = H * props.maxRatio;
    let best = lo;
    for (let i = 0; i < props.iterations; i++) {
        const mid = (lo + hi) / 2;
        b.style.fontSize = `${mid}px`;
        if (fits()) {
            best = mid;
            lo = mid;
        } else {
            hi = mid;
        }
    }
    // Check the upper cap too, so short text reaches it.
    b.style.fontSize = `${H * props.maxRatio}px`;
    if (fits()) best = H * props.maxRatio;
    b.style.fontSize = `${best}px`;
    fontSize.value = best;
}

function schedule(): void {
    if (typeof requestAnimationFrame === 'undefined') return fit();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(fit);
}

onMounted(() => {
    fit();
    if (typeof ResizeObserver !== 'undefined' && box.value) {
        observer = new ResizeObserver(schedule);
        observer.observe(box.value);
    }
});
watch(
    () => props.text,
    () => nextTick(schedule),
);
onBeforeUnmount(() => {
    observer?.disconnect();
    if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(raf);
});

defineExpose({ fit, fontSize });
</script>

<template>
    <div ref="box" class="fit-text" data-testid="fit-text">
        <span ref="inner" class="fit-text-inner">{{ text }}</span>
    </div>
</template>

<style scoped>
.fit-text {
    width: 100%;
    height: 100%;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
}
.fit-text-inner {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: 1.08;
    font-weight: 700;
    letter-spacing: -0.015em;
}
</style>
