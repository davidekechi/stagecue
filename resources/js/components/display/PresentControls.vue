<script setup lang="ts">
// Under the preview: go fullscreen here, or present on another screen (Window Management API).
import { ref } from 'vue';
import { FALLBACK_TEXT, isScreenPickerSupported, listScreens, type ScreenInfo } from '@/display/ScreenPicker';

const emit = defineEmits<{ fullscreen: [screen?: unknown] }>();

const screens = ref<ScreenInfo[] | null>(null);
const screenError = ref<string | null>(null);
const pickerSupported = isScreenPickerSupported();

async function pickScreen() {
    screenError.value = null;
    const r = await listScreens();
    if (r.ok) screens.value = r.screens;
    else screenError.value = r.reason === 'denied' ? `Permission denied. ${FALLBACK_TEXT}` : FALLBACK_TEXT;
}
</script>

<template>
    <section class="flex flex-col gap-3" aria-label="Present" data-testid="present-controls">
        <button class="present-primary" data-testid="setup-fullscreen" @click="emit('fullscreen')">
            Go fullscreen <kbd class="ml-1.5 rounded bg-black/10 px-1.5 font-mono text-xs">F</kbd>
        </button>
        <button v-if="pickerSupported" class="present-secondary" data-testid="setup-pick-screen" @click="pickScreen">Present on another screen…</button>
        <ul v-if="screens" class="space-y-1" data-testid="screen-list">
            <li v-for="s in screens" :key="s.label + s.width">
                <button class="flex w-full items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-left text-sm hover:bg-white/10" @click="emit('fullscreen', s.handle)">
                    <span>{{ s.label }}<span v-if="s.isPrimary" class="ml-2 text-xs text-neutral-400">primary</span></span>
                    <span class="tabular text-neutral-400">{{ s.width }}×{{ s.height }}</span>
                </button>
            </li>
        </ul>
        <p v-if="screenError || !pickerSupported" class="text-sm leading-relaxed text-neutral-400">{{ screenError ?? FALLBACK_TEXT }}</p>
    </section>
</template>

<style scoped>
@reference '../../../css/app.css';
.present-primary {
    @apply flex h-14 items-center justify-center rounded-xl bg-white text-base font-semibold text-black hover:bg-neutral-200;
}
.present-secondary {
    @apply flex h-12 items-center justify-center rounded-xl border border-white/15 text-sm font-medium text-white hover:bg-white/10;
}
</style>
