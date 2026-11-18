<script setup lang="ts">
import { getAccount } from '@/account/account';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { systemClock } from '@/core/clock';
import Stage from '@/components/stage/Stage.vue';
import DevPanel from '@/components/display/DevPanel.vue';
import FullscreenHint from '@/components/display/FullscreenHint.vue';
import PairingCard from '@/components/display/PairingCard.vue';
import SetupPanel from '@/components/display/SetupPanel.vue';
import { DisplayRuntime } from '@/display/DisplayRuntime';
import { DisplaySession } from '@/display/DisplaySession';
import { SnapshotPublisher } from '@/display/SnapshotPublisher';
import { ApiClient } from '@/transport/ApiClient';
import { RealtimeClient, readShellConfig } from '@/transport/RealtimeClient';
import { ServerClock } from '@/transport/ServerClock';
import { DeviceRepo } from '@/storage/DeviceRepo';
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
let session: DisplaySession | null = null;
let meta: MetaRepo | null = null;
const disposers: Array<() => void> = [];
const fullscreen = new Fullscreen({ onChange: (active) => (store.fullscreen = active) });
const wakeLock = new WakeLock({ onChange: (state) => (store.wakeLock = state) });
const wake = () => {
    runtime?.wake();
    session?.wake();
};

const loadErrors = () => meta?.errors() ?? Promise.resolve([]);
const clockOffset = () => runtime?.clockOffset() ?? 0;

async function enterFullscreen(screen?: unknown) {
    await fullscreen.enter(screen);
}

onMounted(async () => {
    if (busy.value) return;
    const db = await getDb();
    meta = new MetaRepo(db);
    const savedClock = await meta.get<{ offsetMs: number; rttMs: number }>('serverClock').catch(() => undefined);
    const serverClock = new ServerClock(undefined, savedClock ?? null, (best) => void meta?.set('serverClock', best).catch(() => undefined));
    const api = new ApiClient({ token: () => session?.token ?? null, serverClock });
    const shellConfig = readShellConfig();
    const publisher = new SnapshotPublisher({
        build: () => runtime!.snapshot(),
        post: (body) => api.postSnapshot(session!.sessionId!, body),
        enabled: () => !!session?.isReady,
        onAuthLoss: (e) => session?.handleError(e),
    });
    runtime = new DisplayRuntime({
        clock: systemClock,
        repo: new PresentationRepo(db),
        processed: new ProcessedCommandRepo(db),
        meta,
        publisher,
        serverNow: () => serverClock.now(),
        staleMs: shellConfig?.staleMs,
        sessionId: () => session?.sessionId ?? null,
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

    // Network side (optional — the presentation never waits for it).
    session = new DisplaySession({
        runtime,
        publisher,
        api,
        devices: new DeviceRepo(db, 'display'),
        meta,
        shellConfig,
        makeRealtime: (config, token) => new RealtimeClient({ config, token, onInvalid: (event, issues) => console.warn('[stagecue] dropped invalid', event, issues) }),
        sink: store.sessionSink,
        displayName: 'Display',
        account: getAccount,
        online: () => navigator.onLine,
    });
    store.attachSession(session);
    void session.start();

    const rt = runtime;
    store.fullscreen = fullscreen.active;
    disposers.push(
        fullscreen.install(),
        installKeyboard(window, {
            toggleFullscreen: () => void fullscreen.toggle(),
            toggleBlackout: () => void rt.localResolve(keyResolvers.blackout),
            toggleClock: () => void rt.localResolve(keyResolvers.clock),
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
    session?.stop();
    store.attachSession(null);
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
            <SetupPanel :load-errors="loadErrors" :clock-offset="clockOffset" @fullscreen="enterFullscreen" @new-presentation="store.localCommand('PRESENTATION_NEW')">
                <template #pairing>
                    <PairingCard
                        :phase="store.phase"
                        :phase-detail="store.phaseDetail"
                        :pairing="store.pairing"
                        :controller="store.controller"
                        :connection="store.connection"
                        :live-link="store.socketState === 'connected'"
                        @regenerate="store.regenerateCode()"
                        @revoke="store.revokeController()"
                    />
                </template>
            </SetupPanel>
            <FullscreenHint :fullscreen="store.fullscreen" />
        </template>
        <DevPanel v-if="devPanel" />
    </main>
</template>
