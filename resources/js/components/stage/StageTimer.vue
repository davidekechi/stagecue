<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import { textShape, useTimerTransform, type Placement } from './useTimerTransform';

const props = defineProps<{
    text: string;
    placement: Placement;
    overtime: boolean;
    paused: boolean;
    stage: HTMLElement | null;
}>();

const el = ref<HTMLElement | null>(null);
const shape = computed(() => textShape(props.text));
const { transform, fontPx, stretch } = useTimerTransform(toRef(props, 'stage'), el, toRef(props, 'placement'), shape);
const compact = computed(() => props.placement !== 'center' && props.placement !== 'overtime');
const moving = ref(false);

defineExpose({ el });
</script>

<template>
    <div
        ref="el"
        class="stage-timer tabular"
        data-testid="stage-timer"
        :data-placement="placement"
        :data-compact="compact"
        :data-overtime="overtime"
        :data-paused="paused"
        :class="{ 'is-moving': moving, 'is-pill': compact, 'is-red': compact && overtime }"
        :style="{ '--timer-transform': transform, fontSize: fontPx ? `${fontPx}px` : undefined }"
        role="timer"
        :aria-label="paused ? `${text}, paused` : text"
        @transitionstart="moving = true"
        @transitionend="moving = false"
        @transitioncancel="moving = false"
    >
        <span class="digits" :style="{ transform: `scaleY(${stretch})` }">{{ text }}</span>
    </div>
</template>

<style scoped>
.stage-timer {
    position: absolute;
    left: 50%;
    top: 50%;
    z-index: 20;
    /* Same padding in every placement, so moving to a corner never refits the font mid-animation. */
    padding: 0.04em 0.16em;
    border-radius: 0.14em;
    /* Until the first measurement: a safe size that fits a 16:9 or 4:3 stage. */
    font-size: min(60cqh, 30cqw);
    /* Tall and bold: Bricolage Grotesque, condensed (wdth 75), heaviest weight. */
    font-weight: 800;
    font-stretch: 75%;
    line-height: 1;
    letter-spacing: 0;
    white-space: nowrap;
    color: var(--stage-fg);
    transform-origin: center;
    transform: var(--timer-transform, translate(-50%, -50%));
    transition:
        transform 500ms cubic-bezier(0.2, 0.8, 0.2, 1),
        background-color 400ms ease;
}
.digits {
    display: inline-block;
    transform-origin: center;
    transition: transform 500ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.stage-timer.is-moving {
    will-change: transform;
}
/* In a corner the timer sits on the white message stage: a black pill, red in overtime. */
.stage-timer.is-pill {
    background: #000;
    color: #fff;
}
.stage-timer.is-red {
    background: var(--overtime-bg);
}
@media (prefers-reduced-motion: reduce) {
    .stage-timer,
    .digits {
        transition-duration: 0ms;
    }
}
</style>
