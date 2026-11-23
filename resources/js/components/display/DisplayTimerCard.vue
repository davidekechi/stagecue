<script setup lang="ts">
// A27 — set and run the timer from the Display itself (no phone, no network). Messages stay phone-only.
import { computed, ref } from 'vue';
import DurationPicker from '@/components/control/DurationPicker.vue';
import { spaceCommand } from '@/display/Keyboard';
import { formatCountdown } from '@/core/format';
import { useDisplayStore } from '@/stores/display';

const store = useDisplayStore();
const duration = ref({ h: 0, m: 15, s: 0 });

const durationMs = computed(() => ((duration.value.h * 60 + duration.value.m) * 60 + duration.value.s) * 1000);
const status = computed(() => store.state?.timer.status ?? 'idle');
const run = computed(() => spaceCommand(status.value));
const RUN_LABELS: Record<string, string> = { TIMER_START: 'Start', TIMER_PAUSE: 'Pause', TIMER_RESUME: 'Resume' };
const runLabel = computed(() => RUN_LABELS[run.value ?? 'TIMER_START'] ?? 'Start');
const setDuration = computed(() => {
    const t = store.state?.timer;
    return t && t.status !== 'idle' ? formatCountdown(t.durationMs) : null;
});

async function set(start: boolean) {
    if (durationMs.value <= 0) return;
    await store.localCommand('TIMER_SET', { durationMs: durationMs.value });
    if (start) await store.localCommand('TIMER_START');
}
const toggleRun = () => run.value && void store.localCommand(run.value);
const reset = () => status.value !== 'idle' && void store.localCommand('TIMER_RESET');
const clear = () => status.value !== 'idle' && void store.localCommand('TIMER_CLEAR');
</script>

<template>
    <div class="flex flex-col gap-3" data-testid="display-timer">
        <p class="text-sm text-neutral-400">
            Works without the phone or the internet.
            <span v-if="setDuration" data-testid="display-timer-current">Timer set to <span class="tabular text-neutral-200">{{ setDuration }}</span>.</span>
        </p>
        <DurationPicker v-model="duration" />
        <div class="grid grid-cols-2 gap-2">
            <button class="btn-primary" :disabled="durationMs <= 0" data-testid="display-timer-set-start" @click="set(true)">Set &amp; start</button>
            <button class="btn" :disabled="durationMs <= 0" data-testid="display-timer-set" @click="set(false)">Set</button>
            <button class="btn" :disabled="!run" data-testid="display-timer-run" @click="toggleRun">{{ runLabel }} <kbd class="ml-1 opacity-60">Space</kbd></button>
            <button class="btn" :disabled="status === 'idle'" data-testid="display-timer-reset" @click="reset">Reset</button>
            <button class="btn col-span-2" :disabled="status === 'idle'" data-testid="display-timer-clear" @click="clear">Clear the timer</button>
        </div>
    </div>
</template>

<style scoped>
@reference '../../../css/app.css';
.btn {
    @apply rounded-lg border border-white/15 px-3 py-2 text-sm font-medium hover:bg-white/10 disabled:opacity-40;
}
.btn-primary {
    @apply rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-neutral-200 disabled:opacity-40;
}
</style>
