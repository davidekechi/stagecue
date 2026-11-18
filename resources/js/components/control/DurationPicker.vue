<script setup lang="ts">
// FR-C2 — H/M/S steppers + quick chips.
import { computed } from 'vue';

const model = defineModel<{ h: number; m: number; s: number }>({ required: true });
const CHIPS = [5, 10, 15, 20, 30];
const MAX_MS = 86_399_000;

const totalMs = computed(() => ((model.value.h * 60 + model.value.m) * 60 + model.value.s) * 1000);

function setTotal(ms: number) {
    const t = Math.min(MAX_MS, Math.max(0, ms)) / 1000;
    model.value = { h: Math.floor(t / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}
function step(unit: 'h' | 'm' | 's', delta: number) {
    const per = unit === 'h' ? 3_600_000 : unit === 'm' ? 60_000 : 1_000;
    setTotal(totalMs.value + delta * per);
}
const pad = (n: number) => String(n).padStart(2, '0');
const units = [
    { key: 'h', label: 'Hours' },
    { key: 'm', label: 'Minutes' },
    { key: 's', label: 'Seconds' },
] as const;
</script>

<template>
    <div class="flex flex-col gap-3" data-testid="duration-picker">
        <div class="grid grid-cols-3 gap-2">
            <div v-for="u in units" :key="u.key" class="flex flex-col items-center rounded-2xl bg-desk py-1">
                <button type="button" class="step" :aria-label="`More ${u.label.toLowerCase()}`" :data-testid="`dur-${u.key}-up`" @click="step(u.key, 1)">+</button>
                <span class="text-[2.25rem] font-bold leading-none tabular" :data-testid="`dur-${u.key}`" :aria-label="`${model[u.key]} ${u.label}`">{{ pad(model[u.key]) }}</span>
                <span class="mt-1 text-xs text-muted">{{ u.label }}</span>
                <button type="button" class="step" :aria-label="`Fewer ${u.label.toLowerCase()}`" :data-testid="`dur-${u.key}-down`" @click="step(u.key, -1)">−</button>
            </div>
        </div>
        <div class="flex gap-2" role="group" aria-label="Quick durations">
            <button
                v-for="c in CHIPS"
                :key="c"
                type="button"
                class="h-12 flex-1 rounded-xl border-2 text-base font-semibold"
                :class="totalMs === c * 60_000 ? 'border-ink bg-ink text-desk' : 'border-panel-2'"
                :data-testid="`chip-${c}`"
                @click="setTotal(c * 60_000)"
            >
                {{ c }}<span class="text-xs font-medium opacity-70">m</span>
            </button>
        </div>
    </div>
</template>

<style scoped>
.step {
    display: flex;
    height: 3rem;
    width: 100%;
    align-items: center;
    justify-content: center;
    font-size: 1.6rem;
    font-weight: 500;
    color: var(--color-muted);
}
.step:active {
    color: var(--color-ink);
}
</style>
