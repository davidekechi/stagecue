<script setup lang="ts">
// LLD §4.6 — buttons follow the timer state; destructive actions on an active timer need a second tap (A4).
import { computed, ref } from 'vue';
import { joinDuration } from '@/core/format';
import type { CommandName, TimerStatus } from '@/core/types';
import type { PendingCommand, Terminal } from '@/control/CommandOutbox';
import CommandButton from './CommandButton.vue';
import DurationPicker from './DurationPicker.vue';

const props = defineProps<{
    status: TimerStatus | null;
    /** The display shows the time of day when no timer is set (A23). */
    clock?: boolean;
    canSend: boolean;
    latest: (name: CommandName) => PendingCommand | undefined;
}>();
const emit = defineEmits<{
    send: [name: CommandName, payload: Record<string, unknown>, done?: (t: Terminal) => void];
    retry: [id: string];
    discard: [id: string];
}>();
const duration = defineModel<{ h: number; m: number; s: number }>('duration', { required: true });

const durationMs = computed(() => joinDuration(duration.value.h, duration.value.m, duration.value.s));
const validDuration = computed(() => durationMs.value >= 1_000);
const active = computed(() => props.status === 'running' || props.status === 'paused' || props.status === 'overtime');
const hasMirror = computed(() => props.status !== null);
const armed = ref<CommandName | 'DISPLAY_START' | null>(null);
let armTimer: ReturnType<typeof setTimeout> | null = null;
const startingAfterSet = ref(false);

/** A destructive command on an active timer asks once more (LLD §4.6, A4). */
function guarded(key: CommandName | 'DISPLAY_START', run: () => void) {
    if (active.value && armed.value !== key) {
        armed.value = key;
        if (armTimer) clearTimeout(armTimer);
        armTimer = setTimeout(() => (armed.value = null), 3_000);
        return;
    }
    armed.value = null;
    run();
}

const set = () => guarded('TIMER_SET', () => emit('send', 'TIMER_SET', { durationMs: durationMs.value }));
const displayAndStart = () =>
    guarded('DISPLAY_START', () => {
        // A3: SET, then START once the Display has confirmed the SET.
        startingAfterSet.value = true;
        emit('send', 'TIMER_SET', { durationMs: durationMs.value }, (t) => {
            if (t === 'confirmed') emit('send', 'TIMER_START', {});
            startingAfterSet.value = false;
        });
    });
const plain = (name: CommandName) => emit('send', name, {});
const reset = () => guarded('TIMER_RESET', () => plain('TIMER_RESET'));
const clear = () => guarded('TIMER_CLEAR', () => plain('TIMER_CLEAR'));

const label = (key: CommandName | 'DISPLAY_START', normal: string) => (armed.value === key ? 'Tap again to confirm' : normal);
const disabled = computed(() => !props.canSend || !hasMirror.value);
const clockEntry = computed(() => props.latest(props.clock ? 'CLOCK_OFF' : 'CLOCK_ON'));
const clockBusy = computed(() => ['sending', 'awaiting'].includes(clockEntry.value?.status ?? ''));
</script>

<template>
    <section class="flex flex-col gap-4 rounded-3xl bg-panel p-4" aria-labelledby="timer-h" data-testid="timer-panel" :data-status="status ?? 'none'">
        <h2 id="timer-h" class="text-lg font-semibold">Timer</h2>
        <DurationPicker v-model="duration" />

        <div class="grid grid-cols-2 gap-3">
            <template v-if="status === 'idle' || status === null">
                <CommandButton :label="label('TIMER_SET', 'Display timer')" testid="btn-display" :entry="latest('TIMER_SET')" :disabled="disabled || !validDuration" @press="set" @retry="emit('retry', $event)" @discard="emit('discard', $event)" />
                <CommandButton :label="startingAfterSet ? 'Starting…' : 'Display & start'" tone="primary" testid="btn-display-start" :entry="latest('TIMER_START')" :disabled="disabled || !validDuration || startingAfterSet" @press="displayAndStart" @retry="emit('retry', $event)" @discard="emit('discard', $event)" />
            </template>
            <template v-else-if="status === 'ready'">
                <CommandButton label="Start" tone="primary" testid="btn-start" :entry="latest('TIMER_START')" :disabled="disabled" @press="plain('TIMER_START')" @retry="emit('retry', $event)" @discard="emit('discard', $event)" />
                <CommandButton :label="label('TIMER_SET', 'Update timer')" testid="btn-display" :entry="latest('TIMER_SET')" :disabled="disabled || !validDuration" @press="set" @retry="emit('retry', $event)" @discard="emit('discard', $event)" />
                <CommandButton :label="label('TIMER_CLEAR', 'Clear timer')" testid="btn-clear" :entry="latest('TIMER_CLEAR')" :disabled="disabled" @press="clear" @retry="emit('retry', $event)" @discard="emit('discard', $event)" />
            </template>
            <template v-else>
                <CommandButton v-if="status === 'paused'" label="Resume" tone="primary" testid="btn-resume" :entry="latest('TIMER_RESUME')" :disabled="disabled" @press="plain('TIMER_RESUME')" @retry="emit('retry', $event)" @discard="emit('discard', $event)" />
                <CommandButton v-else label="Pause" tone="primary" testid="btn-pause" :entry="latest('TIMER_PAUSE')" :disabled="disabled" @press="plain('TIMER_PAUSE')" @retry="emit('retry', $event)" @discard="emit('discard', $event)" />
                <CommandButton :label="label('TIMER_RESET', 'Reset')" testid="btn-reset" :entry="latest('TIMER_RESET')" :disabled="disabled" @press="reset" @retry="emit('retry', $event)" @discard="emit('discard', $event)" />
                <CommandButton :label="label('TIMER_CLEAR', 'Clear timer')" testid="btn-clear" :entry="latest('TIMER_CLEAR')" :disabled="disabled" @press="clear" @retry="emit('retry', $event)" @discard="emit('discard', $event)" />
                <CommandButton :label="label('TIMER_SET', 'Set new time')" testid="btn-display" :entry="latest('TIMER_SET')" :disabled="disabled || !validDuration" @press="set" @retry="emit('retry', $event)" @discard="emit('discard', $event)" />
            </template>
        </div>
        <p v-if="!hasMirror && canSend" class="text-sm text-muted">Waiting for the display’s state…</p>

        <button
            type="button"
            role="switch"
            :aria-checked="!!clock"
            class="flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-desk px-4 text-left disabled:opacity-40"
            :disabled="disabled || clockBusy"
            data-testid="clock-toggle"
            :data-on="!!clock"
            @click="emit('send', clock ? 'CLOCK_OFF' : 'CLOCK_ON', {})"
        >
            <span class="flex flex-col">
                <span class="text-[1.05rem] font-semibold">Show the time</span>
                <span class="text-sm text-muted">{{ clockBusy ? 'Waiting for the display…' : 'Covers the screen, even a timer or black screen. Off goes back.' }}</span>
            </span>
            <span class="relative h-8 w-14 shrink-0 rounded-full transition-colors" :class="clock ? 'bg-go' : 'bg-panel-2'" aria-hidden="true">
                <span class="absolute top-1 h-6 w-6 rounded-full bg-ink transition-[left]" :class="clock ? 'left-7' : 'left-1'"></span>
            </span>
        </button>
    </section>
</template>
