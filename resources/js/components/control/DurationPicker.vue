<script setup lang="ts">
// FR-C2 — set H/M/S by typing (numeric keyboard) or with +/−, which wrap within each field.
import { computed, ref } from 'vue';
import { clampUnit, digitsOnly, stepUnit, UNIT_MAX as MAX, type DurationUnit as Unit } from '@/control/duration';

const model = defineModel<{ h: number; m: number; s: number }>({ required: true });
const CHIPS = [5, 10, 15, 20, 30];
const units: Array<{ key: Unit; label: string }> = [
    { key: 'h', label: 'Hours' },
    { key: 'm', label: 'Minutes' },
    { key: 's', label: 'Seconds' },
];

const totalMs = computed(() => ((model.value.h * 60 + model.value.m) * 60 + model.value.s) * 1000);
const editing = ref<Unit | null>(null);
const draft = ref('');

function setUnit(unit: Unit, value: number) {
    model.value = { ...model.value, [unit]: clampUnit(unit, value) };
}

/** + at the maximum goes to 0; − at 0 goes to the maximum. Each field wraps on its own. */
function step(unit: Unit, delta: 1 | -1) {
    setUnit(unit, stepUnit(unit, model.value[unit], delta));
}

function setChip(minutes: number) {
    const total = minutes * 60;
    model.value = { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: 0 };
}

function onFocus(unit: Unit, e: FocusEvent) {
    editing.value = unit;
    draft.value = String(model.value[unit]);
    // Select everything so typing replaces the value.
    requestAnimationFrame(() => (e.target as HTMLInputElement).select());
}

/** Digits only (letters and signs are dropped), at most 2, clamped as you type. */
function onInput(unit: Unit, e: Event) {
    const el = e.target as HTMLInputElement;
    const digits = digitsOnly(el.value);
    if (digits === '') {
        draft.value = '';
        el.value = '';
        return;
    }
    const v = clampUnit(unit, Number(digits));
    draft.value = String(v);
    el.value = draft.value;
    setUnit(unit, v);
}

function onBlur(unit: Unit) {
    if (draft.value === '') setUnit(unit, 0);
    editing.value = null;
}

const shown = (unit: Unit) => (editing.value === unit ? draft.value : String(model.value[unit]).padStart(2, '0'));
</script>

<template>
    <div class="flex flex-col gap-3" data-testid="duration-picker">
        <div class="grid grid-cols-3 gap-2">
            <div v-for="u in units" :key="u.key" class="flex flex-col items-center rounded-2xl bg-desk py-1">
                <button type="button" class="step" :aria-label="`More ${u.label.toLowerCase()}`" :data-testid="`dur-${u.key}-up`" @click="step(u.key, 1)">+</button>
                <input
                    :value="shown(u.key)"
                    type="text"
                    inputmode="numeric"
                    pattern="[0-9]*"
                    maxlength="2"
                    autocomplete="off"
                    enterkeyhint="done"
                    class="w-full bg-transparent text-center text-[2.25rem] font-bold leading-none tabular outline-none focus:text-standby"
                    :aria-label="`${u.label} (0 to ${MAX[u.key]})`"
                    :data-testid="`dur-${u.key}`"
                    @focus="onFocus(u.key, $event)"
                    @input="onInput(u.key, $event)"
                    @blur="onBlur(u.key)"
                    @keydown.enter="($event.target as HTMLInputElement).blur()"
                />
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
                @click="setChip(c)"
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
