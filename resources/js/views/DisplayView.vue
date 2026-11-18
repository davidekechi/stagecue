<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { systemClock } from '@/core/clock';
import Stage from '@/components/stage/Stage.vue';
import DevPanel from '@/components/display/DevPanel.vue';
import FullscreenHint from '@/components/display/FullscreenHint.vue';
import SetupPanel from '@/components/display/SetupPanel.vue';
import { DisplayRuntime } from '@/display/DisplayRuntime';
import { Fullscreen } from '@/display/Fullscreen';
import { installKeyboard, keyResolvers } from '@/display/Keyboard';
import { WakeLock } from '@/display/WakeLock';
import { getDb, requestPersistence } from '@/storage/db';
import { MetaRepo } from '@/storage/MetaRepo';
import { PresentationRepo } from '@/storage/PresentationRepo';
import { ProcessedCommandRepo } from '@/storage/ProcessedCommandRepo';
import { useDisplayStore } from '@/stores/display';

const store = useDisplayStore();
const route = useRoute();
const devPanel = computed(() => route.query.dev === '1');
const busy = computed(() => store.lock === 'busy');
const booted = ref(false);

let runtime: DisplayRuntime | null = null;
let meta: MetaRepo | null = null;
const disposers: Array<() => void> = [];
const fullscreen = new Fullscreen({ onChange: (active) => (store.fullscreen = active) });
const wakeLock = new WakeLock({ onChange: (state) => (store.wakeLock = state) });
const wake = () => runtime?.wake();

const loadErrors = () => meta?.errors() ?? Promise.resolve([]);
const clockOffset = () => runtime?.clockOffset() ?? 0;

async function enterFullscreen(screen?: unknown) {
    await fullscreen.enter(screen);
}

onMounted(async () => {
    if (busy.value) return;
    const db = await getDb();
    meta = new MetaRepo(db);
    runtime = new DisplayRuntime({
        clock: systemClock,
        repo: new PresentationRepo(db),
        processed: new ProcessedCommandRepo(db),
        meta,
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
    booted.value = true;

    const rt = runtime;
    store.fullscreen = fullscreen.active;
    disposers.push(
        fullscreen.install(),
        installKeyboard(window, {
            toggleFullscreen: () => void fullscreen.toggle(),
            toggleBlackout: () => void rt.localResolve(keyResolvers.blackout),
            startPause: () => void rt.localResolve(keyResolvers.startPause),
            reset: () => void rt.localResolve(keyResolvers.reset),
            dismiss: () => void rt.localResolve(keyResolvers.dismiss),
        }),
    );
    for (const ev of ['pageshow', 'focus', 'online'] as const) window.addEventListener(ev, wake);
    disposers.push(() => {
        for (const ev of ['pageshow', 'focus', 'online'] as const) window.removeEventListener(ev, wake);
    });

    void wakeLock.request();
    store.storagePersisted = await requestPersistence();
});

onBeforeUnmount(() => {
    disposers.forEach((d) => d());
    void wakeLock.release();
    runtime?.stop();
    store.attach(null);
});
</script>

<template>
    <main v-if="busy" class="flex h-full items-center justify-center p-8 text-center" data-testid="display-busy">
        <div class="max-w-md space-y-3">
            <h1 class="text-2xl font-semibold">StageCue Display is already open in another window</h1>
            <p class="text-neutral-400">Only one window can drive the screen. Close this tab, or close the other one and reload.</p>
        </div>
    </main>
    <main v-else class="fixed inset-0 bg-black" data-testid="display-view" :data-ready="booted ? 'true' : 'false'">
        <Stage :view="store.view" mode="live" />
        <template v-if="booted && !store.fullscreen">
            <SetupPanel :load-errors="loadErrors" :clock-offset="clockOffset" @fullscreen="enterFullscreen" @new-presentation="store.localCommand('PRESENTATION_NEW')" />
            <FullscreenHint :fullscreen="store.fullscreen" />
        </template>
        <DevPanel v-if="devPanel" />
    </main>
</template>
