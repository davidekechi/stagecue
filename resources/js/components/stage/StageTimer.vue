<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import { useTimerTransform, type Placement } from './useTimerTransform';

const props = defineProps<{
    text: string;
    placement: Placement;
    overtime: boolean;
    paused: boolean;
    stage: HTMLElement | null;
}>();

const el = ref<HTMLElement | null>(null);
const { transform } = useTimerTransform(toRef(props, 'stage'), el, toRef(props, 'placement'));
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
        :class="{ 'is-moving': moving, 'is-pill': compact && overtime }"
        :style="{ '--timer-transform': transform }"
        role="timer"
        :aria-label="paused ? `${text}, paused` : text"
        @transitionstart="moving = true"
        @transitionend="moving = false"
        @transitioncancel="moving = false"
    >
        <span class="digits">{{ text }}</span>
        <span v-if="paused && !compact" class="paused" data-testid="paused-indicator" aria-hidden="true"><i></i><i></i></span>
    </div>
</template>

<style scoped>
.stage-timer {
    position: absolute;
    left: 50%;
    top: 50%;
    z-index: 20;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0 0.12em;
    border-radius: 0.18em;
    font-size: 22cqh;
    font-weight: 700;
    line-height: 1;
    letter-spacing: -0.02em;
    white-space: nowrap;
    color: var(--stage-fg);
    transform-origin: center;
    transform: var(--timer-transform, translate(-50%, -50%));
    transition:
        transform 500ms cubic-bezier(0.2, 0.8, 0.2, 1),
        background-color 400ms ease;
}
.stage-timer.is-moving {
    will-change: transform;
}
.stage-timer.is-pill {
    background: var(--overtime-bg);
}
.digits {
    display: block;
}
.paused {
    display: flex;
    gap: 0.06em;
    margin-top: 0.12em;
    opacity: 0.55;
}
.paused i {
    display: block;
    width: 0.06em;
    height: 0.2em;
    background: currentColor;
    border-radius: 0.02em;
}
@media (prefers-reduced-motion: reduce) {
    .stage-timer {
        transition-duration: 0ms;
    }
}
</style>
