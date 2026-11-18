<script setup lang="ts">
// FR-M2 — 5/10/15/30/60 s, custom (1–600 s) or until dismissed.
import { computed, ref } from 'vue';

const model = defineModel<number | null>({ required: true });
const PRESETS = [5, 10, 15, 30, 60];
const custom = ref(false);
const isPreset = computed(() => model.value !== null && PRESETS.includes(model.value / 1000));
const customSeconds = computed({
    get: () => (model.value ?? 0) / 1000,
    set: (v: number) => (model.value = Math.min(600, Math.max(1, Math.round(v || 1))) * 1000),
});
</script>

<template>
    <div class="flex flex-col gap-2" data-testid="message-duration">
        <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="How long the message shows">
            <button
                v-for="p in PRESETS"
                :key="p"
                type="button"
                role="radio"
                :aria-checked="!custom && model === p * 1000"
                class="pill"
                :data-on="!custom && model === p * 1000"
                :data-testid="`msgdur-${p}`"
                @click="(custom = false), (model = p * 1000)"
            >
                {{ p }} s
            </button>
            <button type="button" role="radio" :aria-checked="custom || (model !== null && !isPreset)" class="pill" :data-on="custom || (model !== null && !isPreset)" data-testid="msgdur-custom" @click="custom = true">Custom</button>
            <button type="button" role="radio" :aria-checked="model === null" class="pill" :data-on="model === null" data-testid="msgdur-persistent" @click="(custom = false), (model = null)">Until dismissed</button>
        </div>
        <label v-if="custom" class="flex items-center gap-3">
            <input v-model.number="customSeconds" type="number" min="1" max="600" inputmode="numeric" class="h-12 w-28 rounded-xl border-2 border-panel-2 bg-desk px-3 text-lg tabular" data-testid="msgdur-custom-input" />
            <span class="text-muted">seconds (1–600)</span>
        </label>
    </div>
</template>

<style scoped>
.pill {
    min-height: 3rem;
    min-width: 3.5rem;
    border-radius: 0.8rem;
    border: 2px solid var(--color-panel-2);
    padding: 0 0.9rem;
    font-weight: 600;
}
.pill[data-on='true'] {
    border-color: var(--color-ink);
    background: var(--color-ink);
    color: var(--color-desk);
}
</style>
