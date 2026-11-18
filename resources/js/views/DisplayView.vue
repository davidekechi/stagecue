<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { systemClock } from '@/core/clock';
import Stage from '@/components/stage/Stage.vue';
import DevPanel from '@/components/display/DevPanel.vue';
import { DisplayRuntime } from '@/display/DisplayRuntime';
import { installKeyboard, keyResolvers } from '@/display/Keyboard';
import { getDb } from '@/storage/db';
import { MetaRepo } from '@/storage/MetaRepo';
import { PresentationRepo } from '@/storage/PresentationRepo';
import { ProcessedCommandRepo } from '@/storage/ProcessedCommandRepo';
import { useDisplayStore } from '@/stores/display';

const store = useDisplayStore();
const route = useRoute();
const devPanel = computed(() => route.query.dev === '1');

let runtime: DisplayRuntime | null = null;
let disposeKeyboard: (() => void) | null = null;
const wake = () => runtime?.wake();

function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => undefined);
}

onMounted(async () => {
    const db = await getDb();
    runtime = new DisplayRuntime({
        clock: systemClock,
        repo: new PresentationRepo(db),
        processed: new ProcessedCommandRepo(db),
        meta: new MetaRepo(db),
        scheduler: {
            document,
            requestAnimationFrame: (fn) => window.requestAnimationFrame(fn),
            cancelAnimationFrame: (h) => window.cancelAnimationFrame(h as number),
        },
        ...store.sink,
    });
    store.attach(runtime);
    if (devPanel.value) (window as unknown as { __stagecue?: unknown }).__stagecue = { runtime, store };
    await runtime.boot();

    const rt = runtime;
    disposeKeyboard = installKeyboard(window, {
        toggleFullscreen,
        toggleBlackout: () => void rt.localResolve(keyResolvers.blackout),
        startPause: () => void rt.localResolve(keyResolvers.startPause),
        reset: () => void rt.localResolve(keyResolvers.reset),
        dismiss: () => void rt.localResolve(keyResolvers.dismiss),
    });
    for (const ev of ['pageshow', 'focus', 'online'] as const) window.addEventListener(ev, wake);
});

onBeforeUnmount(() => {
    disposeKeyboard?.();
    for (const ev of ['pageshow', 'focus', 'online'] as const) window.removeEventListener(ev, wake);
    runtime?.stop();
    store.attach(null);
});
</script>

<template>
    <main class="fixed inset-0 bg-black" data-testid="display-view" :data-ready="store.state ? 'true' : 'false'">
        <Stage :view="store.view" mode="live" />
        <DevPanel v-if="devPanel" />
    </main>
</template>
