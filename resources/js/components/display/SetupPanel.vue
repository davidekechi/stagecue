<script setup lang="ts">
// LLD §4.5 — technician panel. Rendered ONLY outside fullscreen (FR-D2); never on the stage itself.
import { computed, ref } from 'vue';
import { useDisplayStore } from '@/stores/display';
import { FALLBACK_TEXT, isScreenPickerSupported, listScreens, type ScreenInfo } from '@/display/ScreenPicker';
import type { ErrorEntry } from '@/storage/MetaRepo';
import ConnectToTvGuide from './ConnectToTvGuide.vue';
import InstallPrompt from '@/components/common/InstallPrompt.vue';
import { applyUpdate, displayCanUpdate, updateAvailable } from '@/pwa';

const props = defineProps<{
    loadErrors: () => Promise<ErrorEntry[]>;
    clockOffset: () => number;
}>();
const emit = defineEmits<{ fullscreen: [screen?: unknown]; newPresentation: [] }>();

const store = useDisplayStore();
const collapsed = ref(false);
const screens = ref<ScreenInfo[] | null>(null);
const screenError = ref<string | null>(null);
const confirmingNew = ref(false);
const errors = ref<ErrorEntry[]>([]);
const offset = ref(0);
const pickerSupported = isScreenPickerSupported();
const canUpdate = computed(() => displayCanUpdate(store.state));

const warnings = computed(() => {
    const list: string[] = [];
    if (store.warnings.storageFailed) list.push('State not saved — this browser is refusing storage. The timer keeps running, but a reload will lose it.');
    if (store.warnings.recoveredFromCorrupt) list.push('A damaged saved state was found and set aside. Started a fresh presentation.');
    if (store.storagePersisted === false) list.push('Storage is not persistent. Install StageCue as an app to keep the state safe.');
    if (store.wakeLock === 'unsupported') list.push('This browser cannot keep the screen awake. Disable sleep and the screensaver in the OS settings.');
    return list;
});

async function pickScreen() {
    screenError.value = null;
    const r = await listScreens();
    if (r.ok) screens.value = r.screens;
    else screenError.value = r.reason === 'denied' ? `Permission denied. ${FALLBACK_TEXT}` : FALLBACK_TEXT;
}

function startNew() {
    if (!confirmingNew.value) {
        confirmingNew.value = true;
        setTimeout(() => (confirmingNew.value = false), 4_000);
        return;
    }
    confirmingNew.value = false;
    emit('newPresentation');
}

async function openDiagnostics(e: Event) {
    if (!(e.target as HTMLDetailsElement).open) return;
    errors.value = (await props.loadErrors()).slice(-20).reverse();
    offset.value = props.clockOffset();
}

/** Mouse clicks must not leave focus on a button: Space is the start/pause key. */
function keepFocus(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('button')) e.preventDefault();
}

const kb: Array<[string, string]> = [
    ['F', 'Fullscreen on / off'],
    ['B', 'Black screen on / off'],
    ['C', 'Clock on / off (when no timer is set)'],
    ['Space', 'Start · pause · resume'],
    ['R R', 'Reset (press twice)'],
    ['D', 'Dismiss the message'],
    ['Esc', 'Leave fullscreen'],
];
</script>

<template>
    <button
        v-if="collapsed"
        class="fixed right-0 top-1/2 z-[58] -translate-y-1/2 rounded-l-lg bg-neutral-900/95 px-2 py-4 text-xs font-semibold tracking-wide text-white [writing-mode:vertical-rl]"
        data-testid="setup-expand"
        @mousedown="keepFocus"
        @click="collapsed = false"
    >
        SETUP
    </button>
    <aside
        v-else
        class="fixed inset-y-0 right-0 z-[58] flex w-[30%] min-w-[320px] max-w-[440px] flex-col overflow-y-auto border-l border-white/10 bg-neutral-950/95 text-white shadow-2xl backdrop-blur"
        data-testid="setup-panel"
        aria-label="Display setup"
        @mousedown="keepFocus"
    >
        <header class="sticky top-0 flex items-center justify-between border-b border-white/10 bg-neutral-950/95 px-5 py-4">
            <div>
                <p class="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">StageCue</p>
                <h2 class="text-lg font-semibold">Display setup</h2>
            </div>
            <button class="rounded-md px-2 py-1 text-sm text-neutral-400 hover:bg-white/10 hover:text-white" data-testid="setup-collapse" aria-label="Hide setup panel" @click="collapsed = true">Hide ›</button>
        </header>

        <div class="flex flex-col gap-6 px-5 py-5">
            <section v-if="updateAvailable" class="rounded-lg border border-sky-400/40 bg-sky-400/10 px-3 py-3" data-testid="update-banner">
                <p class="text-sm text-sky-100">A new version of StageCue is ready.</p>
                <button class="btn-primary mt-2" :disabled="!canUpdate" data-testid="update-apply" @click="applyUpdate()">Update now</button>
                <p v-if="!canUpdate" class="mt-2 text-xs text-sky-200/80" data-testid="update-wait">
                    Available when no timer is running and no message is on screen — the presentation is never interrupted.
                </p>
            </section>

            <section v-if="warnings.length" class="space-y-2" data-testid="setup-warnings">
                <p v-for="w in warnings" :key="w" class="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{{ w }}</p>
            </section>

            <InstallPrompt context="display" :ios="false" />

            <section aria-labelledby="pair-h">
                <h3 id="pair-h" class="section-h">Controller</h3>
                <slot name="pairing">
                    <p class="text-sm text-neutral-400">Pairing appears here when the display is online.</p>
                </slot>
            </section>

            <section aria-labelledby="present-h">
                <h3 id="present-h" class="section-h">Present</h3>
                <div class="flex flex-wrap gap-2">
                    <button class="btn-primary" data-testid="setup-fullscreen" @click="emit('fullscreen')">Fullscreen <kbd class="ml-1 opacity-60">F</kbd></button>
                    <button v-if="pickerSupported" class="btn" data-testid="setup-pick-screen" @click="pickScreen">Present on screen…</button>
                </div>
                <ul v-if="screens" class="mt-3 space-y-1" data-testid="screen-list">
                    <li v-for="s in screens" :key="s.label + s.width">
                        <button class="flex w-full items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-left text-sm hover:bg-white/10" @click="emit('fullscreen', s.handle)">
                            <span>{{ s.label }}<span v-if="s.isPrimary" class="ml-2 text-xs text-neutral-400">primary</span></span>
                            <span class="tabular text-neutral-400">{{ s.width }}×{{ s.height }}</span>
                        </button>
                    </li>
                </ul>
                <p v-if="screenError || !pickerSupported" class="mt-2 text-sm text-neutral-400">{{ screenError ?? FALLBACK_TEXT }}</p>
            </section>

            <section aria-labelledby="pres-h">
                <h3 id="pres-h" class="section-h">Presentation</h3>
                <button class="btn" :class="{ 'btn-danger': confirmingNew }" data-testid="setup-new-presentation" @click="startNew">
                    {{ confirmingNew ? 'Click again to clear everything' : 'New presentation' }}
                </button>
            </section>

            <section aria-labelledby="kb-h">
                <h3 id="kb-h" class="section-h">Keyboard</h3>
                <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                    <template v-for="[k, label] in kb" :key="k">
                        <dt><kbd class="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs">{{ k }}</kbd></dt>
                        <dd class="text-neutral-300">{{ label }}</dd>
                    </template>
                </dl>
            </section>

            <details class="group">
                <summary class="section-h cursor-pointer list-none">Connect to a TV <span class="text-neutral-500 group-open:hidden">+</span></summary>
                <ConnectToTvGuide class="mt-2" />
            </details>

            <details class="group" data-testid="diagnostics" @toggle="openDiagnostics">
                <summary class="section-h cursor-pointer list-none">Diagnostics <span class="text-neutral-500 group-open:hidden">+</span></summary>
                <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs text-neutral-300">
                    <dt class="text-neutral-500">Revision</dt>
                    <dd class="tabular" data-testid="diag-revision">{{ store.state?.revision ?? '—' }}</dd>
                    <dt class="text-neutral-500">Presentation</dt>
                    <dd class="truncate font-mono">{{ store.state?.presentationId ?? '—' }}</dd>
                    <dt class="text-neutral-500">Clock offset</dt>
                    <dd class="tabular">{{ offset }} ms</dd>
                    <dt class="text-neutral-500">Storage persisted</dt>
                    <dd>{{ store.storagePersisted === null ? 'unknown' : store.storagePersisted ? 'yes' : 'no' }}</dd>
                    <dt class="text-neutral-500">Wake lock</dt>
                    <dd>{{ store.wakeLock }}</dd>
                </dl>
                <p class="mt-3 text-xs font-semibold text-neutral-400">Recent errors</p>
                <p v-if="!errors.length" class="text-xs text-neutral-500">None.</p>
                <ul v-else class="mt-1 max-h-40 space-y-1 overflow-y-auto text-xs">
                    <li v-for="e in errors" :key="e.at + e.message" class="text-neutral-300">
                        <span class="text-neutral-500">{{ new Date(e.at).toLocaleTimeString() }} · {{ e.context }}</span> {{ e.message }}
                    </li>
                </ul>
            </details>
        </div>
    </aside>
</template>

<style scoped>
@reference '../../../css/app.css';
.section-h {
    @apply mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400;
}
.btn {
    @apply rounded-lg border border-white/15 px-3 py-2 text-sm font-medium hover:bg-white/10;
}
.btn-primary {
    @apply rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-neutral-200 disabled:opacity-40;
}
.btn-danger {
    @apply border-red-500/60 bg-red-500/15 text-red-200;
}
</style>
