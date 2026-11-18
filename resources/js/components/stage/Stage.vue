<script setup lang="ts">
// LLD §4.4 — the audience stage. Same component on the Display and in the Controller's Preview.
import { computed, ref, shallowRef, watch } from 'vue';
import type { View } from '@/core/view';
import StageBlack from './StageBlack.vue';
import StageMessage from './StageMessage.vue';
import StageOvertime from './StageOvertime.vue';
import StageTimer from './StageTimer.vue';
import type { Placement } from './useTimerTransform';

const props = withDefaults(defineProps<{ view: View; mode?: 'live' | 'preview' }>(), { mode: 'live' });

interface TimerInfo {
    text: string;
    placement: Placement;
    overtime: boolean;
    paused: boolean;
}

const stageEl = ref<HTMLElement | null>(null);

function timerFor(view: View): TimerInfo | null {
    switch (view.kind) {
        case 'timer':
            return { text: view.text, placement: 'center', overtime: false, paused: view.paused };
        case 'overtime':
            return { text: view.text, placement: 'overtime', overtime: true, paused: view.paused };
        case 'message':
            return view.compact ? { text: view.compact.text, placement: view.message.corner, overtime: view.compact.overtime, paused: false } : null;
        case 'standby':
        case 'black':
            return null;
    }
}

const black = computed(() => props.view.kind === 'black');
// While blacked out, keep the last timer mounted (hidden), so restoring never re-mounts it.
const lastTimer = shallowRef<TimerInfo | null>(timerFor(props.view));
watch(
    () => props.view,
    (v) => {
        if (v.kind !== 'black') lastTimer.value = timerFor(v);
    },
);
const timer = computed(() => (black.value ? lastTimer.value : timerFor(props.view)));
const message = computed(() => (props.view.kind === 'message' ? props.view.message : null));
const overtimeFull = computed(() => props.view.kind === 'overtime');
const showPaused = computed(() => props.view.kind === 'timer' && props.view.paused);
const overtimePaused = computed(() => props.view.kind === 'overtime' && props.view.paused);
</script>

<template>
    <div ref="stageEl" class="stage" :data-kind="view.kind" :data-mode="mode" data-testid="stage">
        <div class="stage-content" :style="black ? { visibility: 'hidden' } : undefined" :aria-hidden="black">
            <StageOvertime :active="overtimeFull" :paused="overtimePaused" />
            <StageMessage :message="message" :has-compact-timer="!!timer" />
            <div v-if="showPaused" class="stage-paused" data-testid="paused-indicator" aria-hidden="true"><i></i><i></i></div>
            <StageTimer
                v-if="timer"
                :text="timer.text"
                :placement="timer.placement"
                :overtime="timer.overtime"
                :paused="timer.paused"
                :stage="stageEl"
            />
        </div>
        <StageBlack v-if="black" />
    </div>
</template>

<style scoped>
.stage {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    container-type: size;
    background: var(--stage-bg);
    color: var(--stage-fg);
    transition: background-color 300ms ease;
    font-family: var(--font-sans);
    user-select: none;
}
/* Messages are black on white. */
.stage[data-kind='message'] {
    background: #fff;
}
/* Ready/paused: two bars at the bottom, clear of the full-size digits. */
.stage-paused {
    position: absolute;
    left: 50%;
    bottom: calc(var(--safe) * 0.6);
    z-index: 21;
    display: flex;
    gap: 1.6cqh;
    transform: translateX(-50%);
    opacity: 0.55;
}
.stage-paused i {
    display: block;
    width: 1.8cqh;
    height: 6cqh;
    border-radius: 0.5cqh;
    background: var(--stage-fg);
}
.stage-content {
    position: absolute;
    inset: 0;
}
</style>
