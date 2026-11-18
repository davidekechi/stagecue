<script setup lang="ts">
// T7.9 — the operator console: mirror, timer, message, drafts, blackout. One thumb-reachable column.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { uuidv7 } from '@/core/ids';
import type { CommandName, CommandPayloads, MessageShowPayload } from '@/core/types';
import ConnectionBadge from '@/components/common/ConnectionBadge.vue';
import BlackoutZone from '@/components/control/BlackoutZone.vue';
import DraftList from '@/components/control/DraftList.vue';
import LiveMirror from '@/components/control/LiveMirror.vue';
import MessageComposer from '@/components/control/MessageComposer.vue';
import PreviewSheet from '@/components/control/PreviewSheet.vue';
import TimerPanel from '@/components/control/TimerPanel.vue';
import type { Terminal } from '@/control/CommandOutbox';
import { ControllerRuntime } from '@/control/ControllerRuntime';
import { mirrorStateAt } from '@/control/MirrorClock';
import { useMonoNow } from '@/control/useMonoNow';
import { getDb } from '@/storage/db';
import { DeviceRepo } from '@/storage/DeviceRepo';
import { DraftRepo } from '@/storage/DraftRepo';
import { MetaRepo } from '@/storage/MetaRepo';
import { useControlStore } from '@/stores/control';
import { ApiClient } from '@/transport/ApiClient';
import { RealtimeClient, readShellConfig } from '@/transport/RealtimeClient';
import { applyUpdate, updateAvailable } from '@/pwa';

const store = useControlStore();
const router = useRouter();
const mono = useMonoNow(500);
const menuOpen = ref(false);
const previewOpen = ref(false);
let runtime: ControllerRuntime | null = null;
let drafts: DraftRepo | null = null;

const duration = computed({
    get: () => ({ h: store.form.h, m: store.form.m, s: store.form.s }),
    set: (v) => Object.assign(store.form, v),
});
const CONFLICT_LABELS: Partial<Record<CommandName, string>> = { TIMER_SET: 'Set timer', TIMER_RESET: 'Reset', TIMER_CLEAR: 'Clear timer', PRESENTATION_NEW: 'New presentation' };
const conflictLabel = computed(() => (store.conflict ? (CONFLICT_LABELS[store.conflict.name] ?? store.conflict.name) : ''));
/** Explains WHY the buttons are paused. Still paired either way — only the connection is down. */
const linkNotice = computed(() => {
    if (store.connection.server === 'online') {
        return store.connection.peer === 'disconnected' ? 'Still paired. The display isn’t responding — is its window open and online? Commands wait until it’s back.' : null;
    }
    if (store.reachable === false) return 'This phone is offline. Still paired; the display keeps running on its own. Messages you write are saved as drafts.';
    if (store.reachable) return 'Still paired, but the live connection is down, so commands can’t reach the display. Showing the last known state; reconnecting…';
    return 'Connecting…';
});
const timerStatus = computed(() => (store.mirror ? mirrorStateAt(store.mirror, mono.value).state.timer.status : null));
const message = computed(() => (store.mirror && store.mirror.state.message.status === 'showing' ? store.mirror.state.message : null));
const draftPayload = computed<MessageShowPayload | null>(() => {
    const text = store.form.text;
    if (!text.trim()) return null;
    const timed = store.form.durationMs !== null;
    return { id: uuidv7(), text, mode: timed ? 'timed' : 'persistent', durationMs: store.form.durationMs, corner: store.form.corner };
});

function send<N extends CommandName>(name: N, payload: CommandPayloads[N], done?: (t: Terminal) => void) {
    void store.send(name, payload).then((t) => done?.(t));
}

function sendMessage() {
    const p = draftPayload.value;
    if (!p) return;
    previewOpen.value = false;
    send('MESSAGE_SHOW', p, (t) => {
        if (t === 'confirmed') store.form.text = '';
    });
}

async function refreshDrafts() {
    store.drafts = (await drafts?.list().catch(() => [])) ?? [];
}

async function saveDraft() {
    const p = draftPayload.value;
    if (!p || !drafts) return;
    await drafts.put({ id: uuidv7(), createdAt: Date.now(), kind: 'message', name: 'MESSAGE_SHOW', payload: p, label: p.text, corner: p.corner, mode: p.mode });
    store.form.text = '';
    await refreshDrafts();
}

/** LLD §6.6 rule 6: a draft goes out with a NEW commandId and message id, against the current revision. */
async function sendDraft(id: string) {
    const d = store.drafts.find((x) => x.id === id);
    if (!d) return;
    const payload = { ...(d.payload as MessageShowPayload), id: uuidv7() };
    const t = await store.send('MESSAGE_SHOW', payload);
    if (t === 'confirmed') {
        await drafts?.delete(id);
        await refreshDrafts();
    }
}

async function discardDraft(id: string) {
    await drafts?.delete(id);
    await refreshDrafts();
}

async function unpair() {
    menuOpen.value = false;
    await store.unpair();
}

const wake = () => runtime?.wake();
/** LLD §4.10: the phone applies an update by itself when it is in the background and idle. */
function maybeApplyUpdate() {
    const busy = store.outbox.some((e) => e.status === 'sending' || e.status === 'awaiting');
    if (updateAvailable.value && !busy && !store.form.text.trim()) applyUpdate();
}
const onVisibility = () => {
    if (document.visibilityState === 'visible') wake();
    else maybeApplyUpdate();
};

watch(
    () => store.unpaired,
    (reason) => {
        if (reason) void router.replace({ path: '/pair', query: reason === 'none' ? {} : { reason } });
    },
);

onMounted(async () => {
    store.unpaired = null;
    const db = await getDb();
    drafts = new DraftRepo(db);
    void refreshDrafts();
    const api = new ApiClient({ token: () => runtime?.token ?? null });
    runtime = new ControllerRuntime({
        api,
        devices: new DeviceRepo(db, 'controller'),
        meta: new MetaRepo(db),
        shellConfig: readShellConfig(),
        makeRealtime: (config, token) => new RealtimeClient({ config, token, onInvalid: (event, issues) => console.warn('[stagecue] dropped invalid', event, issues) }),
        sink: store.sink,
        online: () => navigator.onLine,
        log: (m, d) => console.info('[stagecue]', m, d),
    });
    store.attach(runtime);
    if (new URLSearchParams(location.search).get('dev') === '1') (window as unknown as { __stagecueControl?: unknown }).__stagecueControl = { runtime, store };
    await runtime.start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', wake);
    window.addEventListener('pageshow', wake);
});

onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('online', wake);
    window.removeEventListener('pageshow', wake);
    runtime?.stop();
    store.attach(null);
});
</script>

<template>
    <div class="flex min-h-full flex-col bg-desk text-ink" data-testid="control-view">
        <header class="sticky top-0 z-30 flex flex-col gap-2 border-b border-panel-2 bg-desk/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
            <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                    <p class="truncate text-lg font-bold leading-tight" data-testid="control-session">{{ store.session?.sessionName ?? 'StageCue' }}</p>
                    <p class="truncate text-xs text-muted">This phone: {{ store.session?.deviceName ?? '…' }}</p>
                </div>
                <div class="relative">
                    <button type="button" class="flex h-12 w-12 items-center justify-center rounded-xl text-2xl text-muted" aria-label="Menu" :aria-expanded="menuOpen" data-testid="control-menu" @click="menuOpen = !menuOpen">⋯</button>
                    <div v-if="menuOpen" class="absolute right-0 top-13 z-40 w-56 rounded-2xl border border-panel-2 bg-panel p-2 shadow-2xl">
                        <button type="button" class="flex h-12 w-full items-center rounded-xl px-3 text-left font-semibold text-stage-red" data-testid="control-unpair" @click="unpair">Unpair this phone</button>
                    </div>
                </div>
            </div>
            <ConnectionBadge :server="store.connection.server" :peer="store.connection.peer" peer-label="Display" />
            <p v-if="linkNotice" class="rounded-xl border border-standby/40 bg-standby/10 px-3 py-2 text-sm leading-snug" role="status" data-testid="link-notice">{{ linkNotice }}</p>
        </header>

        <main class="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-4">
            <LiveMirror :mirror="store.mirror" :connected="store.connection.peer === 'connected'" />
            <DraftList :drafts="store.drafts" :can-send="store.canSend" @send="sendDraft" @discard="discardDraft" />
            <TimerPanel
                v-model:duration="duration"
                :status="timerStatus"
                :clock="store.mirror?.state.display.clock ?? false"
                :can-send="store.canSend"
                :latest="store.latest"
                @send="(n, p, done) => send(n, p as never, done)"
                @retry="store.retry"
                @discard="store.discard"
            />
            <MessageComposer
                v-model:text="store.form.text"
                v-model:duration-ms="store.form.durationMs"
                v-model:corner="store.form.corner"
                :can-send="store.canSend"
                :showing="!!message"
                :send-entry="store.latest('MESSAGE_SHOW')"
                :clear-entry="store.latest('MESSAGE_DISMISS')"
                @preview="previewOpen = true"
                @send="sendMessage"
                @draft="saveDraft"
                @clear="message && send('MESSAGE_DISMISS', { id: message.id })"
                @retry="store.retry"
                @discard="store.discard"
            />
        </main>

        <div class="sticky bottom-0 z-30">
            <BlackoutZone
                :blackout="store.blackout"
                :disabled="!store.canSend"
                :pending="['sending', 'awaiting'].includes(store.latest(store.blackout ? 'BLACKOUT_OFF' : 'BLACKOUT_ON')?.status ?? '')"
                @blackout="send('BLACKOUT_ON', {})"
                @restore="send('BLACKOUT_OFF', {})"
            />
        </div>

        <div v-if="store.conflict" class="fixed inset-0 z-50 flex flex-col justify-end bg-black/70" data-testid="conflict-sheet">
            <div class="flex flex-col gap-4 rounded-t-3xl border-t-2 border-standby bg-panel p-5 pb-8" role="alertdialog" aria-modal="true" aria-labelledby="conflict-h">
                <h2 id="conflict-h" class="text-xl font-bold">The display changed</h2>
                <p class="text-[0.95rem] leading-relaxed text-muted">Someone changed the timer since you last looked, so “{{ conflictLabel }}” wasn’t applied. Check the live view, then confirm again.</p>
                <LiveMirror :mirror="store.mirror" :connected="store.connection.peer === 'connected'" />
                <button type="button" class="h-14 rounded-xl bg-ink text-lg font-semibold text-desk" data-testid="conflict-confirm" @click="store.confirmConflict()">Confirm again</button>
                <button type="button" class="h-12 rounded-xl border-2 border-panel-2 font-semibold" data-testid="conflict-cancel" @click="store.dismissConflict()">Cancel</button>
            </div>
        </div>

        <PreviewSheet v-if="previewOpen" :mirror="store.mirror" :message="draftPayload" :can-send="store.canSend" @close="previewOpen = false" @send="sendMessage" />
    </div>
</template>
