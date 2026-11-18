<script setup lang="ts">
// Temporary manual-QA panel (T3.5). Only rendered with `?dev=1` (see ambiguity log A16).
import { uuidv7 } from '@/core/ids';
import type { Corner } from '@/core/types';
import { useDisplayStore } from '@/stores/display';

const store = useDisplayStore();
const set = (ms: number) => store.localCommand('TIMER_SET', { durationMs: ms });
const say = (corner: Corner, mode: 'timed' | 'persistent' = 'timed') =>
    store.localCommand('MESSAGE_SHOW', {
        id: uuidv7(),
        text: mode === 'timed' ? `Message in ${corner.toUpperCase()}\nfor five seconds` : 'Please take your seats — the session starts shortly',
        mode,
        durationMs: mode === 'timed' ? 5_000 : null,
        corner,
    });
</script>

<template>
    <div class="fixed bottom-2 left-2 z-[60] flex max-w-[28rem] flex-wrap gap-1 rounded-lg bg-neutral-900/90 p-2 text-xs text-white" data-testid="dev-panel">
        <button tabindex="-1" data-testid="dev-set-10s" class="dev-btn" @mousedown.prevent @click="set(10_000)">SET 0:10</button>
        <button tabindex="-1" data-testid="dev-set-15m" class="dev-btn" @mousedown.prevent @click="set(900_000)">SET 15:00</button>
        <button tabindex="-1" data-testid="dev-set-1h" class="dev-btn" @mousedown.prevent @click="set(3_725_000)">SET 1:02:05</button>
        <button tabindex="-1" class="dev-btn" @mousedown.prevent @click="store.localCommand('TIMER_START')">Start</button>
        <button tabindex="-1" class="dev-btn" @mousedown.prevent @click="store.localCommand('TIMER_PAUSE')">Pause</button>
        <button tabindex="-1" class="dev-btn" @mousedown.prevent @click="store.localCommand('TIMER_RESUME')">Resume</button>
        <button tabindex="-1" class="dev-btn" @mousedown.prevent @click="store.localCommand('TIMER_RESET')">Reset</button>
        <button tabindex="-1" class="dev-btn" @mousedown.prevent @click="store.localCommand('TIMER_CLEAR')">Clear</button>
        <button v-for="c in ['tl', 'tr', 'bl', 'br'] as Corner[]" :key="c" tabindex="-1" :data-testid="`dev-msg-${c}`" class="dev-btn" @mousedown.prevent @click="say(c)">Msg {{ c }}</button>
        <button tabindex="-1" data-testid="dev-msg-persistent" class="dev-btn" @mousedown.prevent @click="say('tr', 'persistent')">Msg ∞</button>
        <button tabindex="-1" class="dev-btn" @mousedown.prevent @click="store.localCommand('MESSAGE_DISMISS', {})">Dismiss</button>
        <button tabindex="-1" class="dev-btn" @mousedown.prevent @click="store.localCommand('PRESENTATION_NEW')">New</button>
    </div>
</template>

<style scoped>
.dev-btn {
    border-radius: 0.375rem;
    background: #333;
    padding: 0.25rem 0.5rem;
}
.dev-btn:hover {
    background: #555;
}
</style>
