<script setup lang="ts">
// A 2×2 mini-screen: where the timer goes while the message shows.
import type { Corner } from '@/core/types';

const model = defineModel<Corner>({ required: true });
const corners: Array<{ c: Corner; label: string }> = [
    { c: 'tl', label: 'Top left' },
    { c: 'tr', label: 'Top right' },
    { c: 'bl', label: 'Bottom left' },
    { c: 'br', label: 'Bottom right' },
];
</script>

<template>
    <div class="grid aspect-video w-full grid-cols-2 grid-rows-2 gap-1.5 rounded-2xl border-2 border-panel-2 bg-black p-1.5" role="radiogroup" aria-label="Timer corner" data-testid="corner-picker">
        <button
            v-for="k in corners"
            :key="k.c"
            type="button"
            role="radio"
            :aria-checked="model === k.c"
            :aria-label="k.label"
            class="flex rounded-xl p-2 transition-colors"
            :class="[model === k.c ? 'bg-panel-2' : 'bg-transparent', k.c[0] === 't' ? 'items-start' : 'items-end', k.c[1] === 'l' ? 'justify-start' : 'justify-end']"
            :data-testid="`corner-${k.c}`"
            @click="model = k.c"
        >
            <span class="h-3 w-9 rounded-full" :class="model === k.c ? 'bg-ink' : 'bg-panel-2'"></span>
        </button>
    </div>
</template>
