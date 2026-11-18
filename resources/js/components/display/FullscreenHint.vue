<script setup lang="ts">
// A9 — after a (re)load the browser needs a gesture to go fullscreen: show a 4 s hint.
import { onBeforeUnmount, onMounted, ref } from 'vue';

const props = withDefaults(defineProps<{ fullscreen: boolean; durationMs?: number }>(), { durationMs: 4_000 });
const visible = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;

onMounted(() => {
    if (props.fullscreen) return;
    visible.value = true;
    timer = setTimeout(() => (visible.value = false), props.durationMs);
});
onBeforeUnmount(() => timer && clearTimeout(timer));
</script>

<template>
    <Transition name="hint">
        <div
            v-if="visible && !fullscreen"
            class="pointer-events-none fixed left-4 top-4 z-[55] rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white/80 backdrop-blur"
            data-testid="fullscreen-hint"
        >
            Press <kbd class="rounded bg-white/20 px-1.5 font-mono">F</kbd> for fullscreen
        </div>
    </Transition>
</template>

<style scoped>
.hint-enter-active,
.hint-leave-active {
    transition: opacity 300ms ease;
}
.hint-enter-from,
.hint-leave-to {
    opacity: 0;
}
</style>
