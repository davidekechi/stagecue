<script setup lang="ts">
// LLD §4.6 — idle → sending → awaiting-ack → confirmed (800 ms) → idle, or rejected (reason), or
// unconfirmed after 3 s with Retry (same commandId).
import { computed } from 'vue';
import type { PendingCommand } from '@/control/CommandOutbox';

const props = withDefaults(
    defineProps<{
        label: string;
        entry?: PendingCommand | null;
        disabled?: boolean;
        tone?: 'primary' | 'plain' | 'danger';
        testid?: string;
    }>(),
    { entry: null, disabled: false, tone: 'plain', testid: undefined },
);
const emit = defineEmits<{ press: []; retry: [commandId: string]; discard: [commandId: string] }>();

const status = computed(() => props.entry?.status ?? 'idle');
const busy = computed(() => status.value === 'sending' || status.value === 'awaiting');
const needsRetry = computed(() => status.value === 'unconfirmed' || status.value === 'failed');
const hint = computed(() => {
    switch (status.value) {
        case 'sending':
            return 'Sending…';
        case 'awaiting':
            return 'Waiting for the display…';
        case 'confirmed':
            return 'Done';
        case 'rejected':
            return props.entry?.message || 'The display didn’t apply it.';
        case 'unconfirmed':
            return 'Not confirmed by the display.';
        case 'failed':
            return 'Couldn’t reach StageCue.';
        default:
            return '';
    }
});
</script>

<template>
    <div class="flex min-w-0 flex-col gap-1.5">
        <button
            type="button"
            class="cmd"
            :data-tone="tone"
            :data-status="status"
            :data-testid="testid"
            :disabled="disabled || busy"
            :aria-busy="busy"
            @click="emit('press')"
        >
            <span class="lamp" aria-hidden="true"></span>
            <span class="truncate">{{ label }}</span>
        </button>
        <p v-if="hint" class="text-[0.8rem] leading-snug" :class="status === 'rejected' || needsRetry ? 'text-standby' : 'text-muted'" role="status" :data-testid="testid ? `${testid}-status` : undefined">
            {{ hint }}
        </p>
        <div v-if="needsRetry && entry" class="flex gap-2">
            <button type="button" class="h-11 flex-1 rounded-xl bg-standby font-semibold text-desk" :data-testid="testid ? `${testid}-retry` : undefined" @click="emit('retry', entry.commandId)">Retry</button>
            <button type="button" class="h-11 rounded-xl border-2 border-panel-2 px-4 font-semibold" @click="emit('discard', entry.commandId)">Dismiss</button>
        </div>
    </div>
</template>

<style scoped>
.cmd {
    position: relative;
    display: flex;
    min-height: 3.5rem;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    border-radius: 0.9rem;
    border: 2px solid var(--color-panel-2);
    background: var(--color-panel);
    padding: 0 1rem;
    font-size: 1.05rem;
    font-weight: 650;
    color: var(--color-ink);
    transition:
        background-color 150ms,
        border-color 150ms,
        transform 80ms;
}
.cmd:active:not(:disabled) {
    transform: scale(0.98);
}
.cmd:disabled {
    opacity: 0.4;
}
.cmd[aria-busy='true'] {
    opacity: 1;
}
.cmd[data-tone='primary'] {
    background: var(--color-ink);
    border-color: var(--color-ink);
    color: var(--color-desk);
}
.cmd[data-tone='danger'] {
    border-color: color-mix(in srgb, var(--color-stage-red) 70%, transparent);
}
.cmd:focus-visible {
    outline: 3px solid var(--color-standby);
    outline-offset: 2px;
}
/* The cue light: amber = standby (waiting), green = go (confirmed). */
.lamp {
    display: none;
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 999px;
}
.cmd:is([data-status='sending'], [data-status='awaiting']) .lamp {
    display: block;
    background: var(--color-standby);
    box-shadow: 0 0 0.6rem var(--color-standby);
    animation: blink 0.9s ease-in-out infinite;
}
.cmd[data-status='confirmed'] .lamp {
    display: block;
    background: var(--color-go);
    box-shadow: 0 0 0.6rem var(--color-go);
}
.cmd:is([data-status='rejected'], [data-status='unconfirmed'], [data-status='failed']) {
    border-color: var(--color-standby);
}
@keyframes blink {
    50% {
        opacity: 0.35;
    }
}
@media (prefers-reduced-motion: reduce) {
    .lamp {
        animation: none !important;
    }
}
</style>
