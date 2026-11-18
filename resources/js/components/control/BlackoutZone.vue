<script setup lang="ts">
// FR-C7 — Black screen needs a 600 ms hold; Restore display is one tap and impossible to miss.
import { onBeforeUnmount, ref } from 'vue';

const props = withDefaults(defineProps<{ blackout: boolean; disabled?: boolean; holdMs?: number; pending?: boolean }>(), { disabled: false, holdMs: 600, pending: false });
const emit = defineEmits<{ blackout: []; restore: [] }>();

const progress = ref(0);
let start = 0;
let raf = 0;
let fired = false;

function frame(t: number) {
    progress.value = Math.min(1, (t - start) / props.holdMs);
    if (progress.value >= 1 && !fired) {
        fired = true;
        navigator.vibrate?.(30);
        emit('blackout');
        return;
    }
    raf = requestAnimationFrame(frame);
}
function down(e: PointerEvent) {
    if (props.disabled) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    fired = false;
    start = performance.now();
    raf = requestAnimationFrame(frame);
}
function up() {
    cancelAnimationFrame(raf);
    progress.value = 0;
}
/** Keyboard / switch access: hold Space or Enter. */
function key(e: KeyboardEvent, isDown: boolean) {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (isDown && !e.repeat) down({ currentTarget: e.currentTarget, pointerId: 0 } as unknown as PointerEvent);
    if (!isDown) up();
}
onBeforeUnmount(() => cancelAnimationFrame(raf));
</script>

<template>
    <div class="border-t border-panel-2 bg-desk/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur" data-testid="blackout-zone" :data-blackout="blackout">
        <button
            v-if="blackout"
            type="button"
            class="h-16 w-full rounded-2xl bg-white text-xl font-bold text-black disabled:opacity-50"
            :disabled="disabled || pending"
            data-testid="restore"
            @click="emit('restore')"
        >
            {{ pending ? 'Restoring…' : 'Restore display' }}
        </button>
        <button
            v-else
            type="button"
            class="hold relative flex h-16 w-full items-center justify-center gap-3 overflow-hidden rounded-2xl border-2 border-stage-red text-lg font-semibold text-ink disabled:opacity-40"
            :disabled="disabled || pending"
            :aria-label="'Black screen. Press and hold.'"
            data-testid="hold-blackout"
            @pointerdown="down"
            @pointerup="up"
            @pointercancel="up"
            @pointerleave="up"
            @keydown="key($event, true)"
            @keyup="key($event, false)"
            @contextmenu.prevent
        >
            <span class="absolute inset-y-0 left-0 bg-stage-red/70" :style="{ width: `${progress * 100}%` }" aria-hidden="true"></span>
            <svg class="relative h-7 w-7 -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
                <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" stroke-opacity="0.25" stroke-width="4" />
                <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" :stroke-dasharray="94.25" :stroke-dashoffset="94.25 * (1 - progress)" />
            </svg>
            <span class="relative">{{ pending ? 'Going black…' : 'Hold for black screen' }}</span>
        </button>
    </div>
</template>

<style scoped>
.hold {
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
}
</style>
