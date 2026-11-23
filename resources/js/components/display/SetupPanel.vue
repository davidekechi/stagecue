<script setup lang="ts">
// LLD §4.5 — technician panel. Rendered ONLY outside fullscreen (FR-D2); never on the stage itself.
// Layout: the left two thirds of the window, one tab per category (the preview and Present buttons are on the right).
import { computed, ref } from 'vue';
import { useDisplayStore } from '@/stores/display';
import type { ErrorEntry } from '@/storage/MetaRepo';
import ConnectToTvGuide from './ConnectToTvGuide.vue';
import DisplayTimerCard from './DisplayTimerCard.vue';
import InstallPrompt from '@/components/common/InstallPrompt.vue';
import { applyUpdate, displayCanUpdate, updateAvailable } from '@/pwa';

const props = defineProps<{
    loadErrors: () => Promise<ErrorEntry[]>;
    clockOffset: () => number;
}>();
const emit = defineEmits<{ newPresentation: [] }>();
/** Hidden: the stage takes the whole window (still not fullscreen). */
const hidden = defineModel<boolean>('hidden', { default: false });

const store = useDisplayStore();
type Tab = 'phones' | 'timer' | 'keys' | 'tv' | 'more';
const TABS: Array<{ id: Tab; label: string }> = [
    { id: 'phones', label: 'Phones' },
    { id: 'timer', label: 'Timer' },
    { id: 'keys', label: 'Keyboard' },
    { id: 'tv', label: 'Connect a TV' },
    { id: 'more', label: 'More' },
];
const tab = ref<Tab>('phones');
const confirmingNew = ref(false);
const errors = ref<ErrorEntry[]>([]);
const offset = ref(0);
const canUpdate = computed(() => displayCanUpdate(store.state));

const warnings = computed(() => {
    const list: string[] = [];
    if (store.warnings.storageFailed) list.push('State not saved — this browser is refusing storage. The timer keeps running, but a reload will lose it.');
    if (store.warnings.recoveredFromCorrupt) list.push('A damaged saved state was found and set aside. Started a fresh presentation.');
    if (store.storagePersisted === false) list.push('Storage is not persistent. Install StageCue as an app to keep the state safe.');
    if (store.wakeLock === 'unsupported') list.push('This browser cannot keep the screen awake. Disable sleep and the screensaver in the OS settings.');
    return list;
});

function startNew() {
    if (!confirmingNew.value) {
        confirmingNew.value = true;
        setTimeout(() => (confirmingNew.value = false), 4_000);
        return;
    }
    confirmingNew.value = false;
    emit('newPresentation');
}

async function openDiagnostics() {
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
    ['C', 'Show the time over everything / back'],
    ['Tab', 'Set the timer to 00:01'],
    ['Space', 'Start · pause · resume'],
    ['R R', 'Reset (press twice)'],
    ['D', 'Dismiss the message'],
    ['Esc', 'Leave fullscreen'],
];

/** Arrow keys move between tabs (WAI-ARIA tabs pattern). */
function onTabKey(e: KeyboardEvent) {
    const i = TABS.findIndex((t) => t.id === tab.value);
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
    if (next === null) return;
    e.preventDefault();
    tab.value = TABS[(next + TABS.length) % TABS.length]!.id;
}
function select(t: Tab) {
    tab.value = t;
    if (t === 'more') void openDiagnostics();
}
</script>

<template>
    <button
        v-if="hidden"
        class="fixed left-0 top-1/2 z-[58] -translate-y-1/2 rounded-r-lg bg-neutral-900/95 px-2 py-4 text-xs font-semibold tracking-wide text-white [writing-mode:vertical-rl]"
        data-testid="setup-expand"
        @mousedown="keepFocus"
        @click="hidden = false"
    >
        SETUP
    </button>
    <aside
        v-else
        class="fixed inset-y-0 left-0 z-[58] flex w-2/3 flex-col border-r border-white/10 bg-neutral-950 text-white"
        data-testid="setup-panel"
        aria-label="Display setup"
        @mousedown="keepFocus"
    >
        <header class="flex items-center justify-between gap-4 border-b border-white/10 px-8 pt-5">
            <div class="flex min-w-0 flex-col gap-4">
                <div>
                    <p class="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">StageCue</p>
                    <h2 class="text-xl font-semibold">Display setup</h2>
                </div>
                <div class="-mb-px flex gap-1 overflow-x-auto" role="tablist" aria-label="Setup sections" @keydown="onTabKey">
                    <button
                        v-for="t in TABS"
                        :id="`setup-tab-${t.id}`"
                        :key="t.id"
                        type="button"
                        role="tab"
                        class="tab"
                        :class="{ 'is-active': tab === t.id }"
                        :aria-selected="tab === t.id"
                        :aria-controls="`setup-tabpanel-${t.id}`"
                        :tabindex="tab === t.id ? 0 : -1"
                        :data-testid="`setup-tab-${t.id}`"
                        @click="select(t.id)"
                    >
                        {{ t.label }}
                    </button>
                </div>
            </div>
            <button class="self-start rounded-md px-2 py-1 text-sm text-neutral-400 hover:bg-white/10 hover:text-white" data-testid="setup-collapse" aria-label="Hide setup panel" @click="hidden = true">‹ Hide</button>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto px-8 py-6">
            <div class="flex max-w-3xl flex-col gap-6">
                <section v-if="updateAvailable" class="rounded-lg border border-sky-400/40 bg-sky-400/10 px-4 py-3" data-testid="update-banner">
                    <p class="text-sm text-sky-100">A new version of StageCue is ready.</p>
                    <button class="btn-primary mt-2" :disabled="!canUpdate" data-testid="update-apply" @click="applyUpdate()">Update now</button>
                    <p v-if="!canUpdate" class="mt-2 text-xs text-sky-200/80" data-testid="update-wait">
                        Available when no timer is running and no message is on screen — the presentation is never interrupted.
                    </p>
                </section>

                <section v-if="warnings.length" class="space-y-2" data-testid="setup-warnings">
                    <p v-for="w in warnings" :key="w" class="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">{{ w }}</p>
                </section>

                <section v-show="tab === 'phones'" id="setup-tabpanel-phones" role="tabpanel" aria-labelledby="setup-tab-phones" class="flex flex-col gap-4" data-testid="setup-tabpanel-phones">
                    <p class="text-sm leading-relaxed text-neutral-400">Pair one or more phones to control this display. Each phone must be logged in to the same account.</p>
                    <slot name="pairing">
                        <p class="text-sm text-neutral-400">Pairing appears here when the display is online.</p>
                    </slot>
                    <InstallPrompt context="display" :ios="false" />
                </section>

                <section v-show="tab === 'timer'" id="setup-tabpanel-timer" role="tabpanel" aria-labelledby="setup-tab-timer" data-testid="setup-tabpanel-timer">
                    <div class="max-w-md">
                        <DisplayTimerCard />
                    </div>
                </section>

                <section v-show="tab === 'keys'" id="setup-tabpanel-keys" role="tabpanel" aria-labelledby="setup-tab-keys" data-testid="setup-tabpanel-keys">
                    <p class="mb-4 text-sm text-neutral-400">These work on this computer even with no phone and no internet.</p>
                    <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-[0.95rem]">
                        <template v-for="[k, label] in kb" :key="k">
                            <dt><kbd class="inline-block min-w-[3rem] rounded-md bg-white/10 px-2 py-1 text-center font-mono text-sm">{{ k }}</kbd></dt>
                            <dd class="self-center text-neutral-200">{{ label }}</dd>
                        </template>
                    </dl>
                </section>

                <section v-show="tab === 'tv'" id="setup-tabpanel-tv" role="tabpanel" aria-labelledby="setup-tab-tv" data-testid="setup-tabpanel-tv">
                    <ConnectToTvGuide />
                </section>

                <section v-show="tab === 'more'" id="setup-tabpanel-more" role="tabpanel" aria-labelledby="setup-tab-more" class="flex flex-col gap-8" data-testid="setup-tabpanel-more">
                    <div>
                        <h3 class="section-h">Presentation</h3>
                        <p class="mb-3 text-sm text-neutral-400">Clears the timer, the message and the black screen. Pairing and settings are kept.</p>
                        <button class="btn" :class="{ 'btn-danger': confirmingNew }" data-testid="setup-new-presentation" @click="startNew">
                            {{ confirmingNew ? 'Click again to clear everything' : 'New presentation' }}
                        </button>
                    </div>
                    <div data-testid="diagnostics">
                        <h3 class="section-h">Diagnostics</h3>
                        <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm text-neutral-300">
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
                        <p class="mt-4 text-xs font-semibold text-neutral-400">Recent errors</p>
                        <p v-if="!errors.length" class="text-xs text-neutral-500">None.</p>
                        <ul v-else class="mt-1 max-h-60 space-y-1 overflow-y-auto text-xs">
                            <li v-for="e in errors" :key="e.at + e.message" class="text-neutral-300">
                                <span class="text-neutral-500">{{ new Date(e.at).toLocaleTimeString() }} · {{ e.context }}</span> {{ e.message }}
                            </li>
                        </ul>
                    </div>
                </section>
            </div>
        </div>
    </aside>
</template>

<style scoped>
@reference '../../../css/app.css';
.section-h {
    @apply mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400;
}
.tab {
    @apply shrink-0 rounded-t-lg border-b-2 border-transparent px-4 py-2.5 text-sm font-semibold text-neutral-400 hover:text-white;
}
.tab.is-active {
    @apply border-white text-white;
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
