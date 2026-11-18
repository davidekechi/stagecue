<script setup lang="ts">
// T9.2 / FR-O3 — offer installation: the native prompt where the browser supports it
// (Chrome, Edge, Android), and the Share → Add to Home Screen hint on iPhone/iPad.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { isIosBrowserTab } from '@/control/QrScanner';

interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const props = withDefaults(defineProps<{ context?: 'display' | 'controller'; ios?: boolean | null }>(), { context: 'controller', ios: null });

const DISMISS_KEY = 'stagecue.install.dismissed';
const deferred = ref<BeforeInstallPromptEvent | null>(null);
const dismissed = ref(false);
const installed = ref(false);
const iosTab = computed(() => props.ios ?? isIosBrowserTab());
const show = computed(() => !dismissed.value && !installed.value && (deferred.value !== null || iosTab.value));

const onPrompt = (e: Event) => {
    e.preventDefault(); // keep it for our own button
    deferred.value = e as BeforeInstallPromptEvent;
};
const onInstalled = () => (installed.value = true);

onMounted(() => {
    try {
        dismissed.value = localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
        // storage unavailable: show it
    }
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
});
onBeforeUnmount(() => {
    window.removeEventListener('beforeinstallprompt', onPrompt);
    window.removeEventListener('appinstalled', onInstalled);
});

async function install() {
    const e = deferred.value;
    if (!e) return;
    await e.prompt();
    const choice = await e.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
    deferred.value = null;
    if (choice.outcome === 'accepted') installed.value = true;
}

function dismiss() {
    dismissed.value = true;
    try {
        localStorage.setItem(DISMISS_KEY, '1');
    } catch {
        // ignore
    }
}

const why = computed(() =>
    props.context === 'display'
        ? 'Installed, StageCue opens in its own window without tabs, keeps its state safe and works offline.'
        : 'Installed, StageCue opens straight to the controller and stays paired.',
);
</script>

<template>
    <div v-if="show" class="rounded-2xl border border-white/15 bg-white/5 p-4 text-sm" data-testid="install-prompt">
        <p class="font-semibold">Install StageCue</p>
        <p class="mt-1 text-white/70">{{ why }}</p>
        <p v-if="!deferred && iosTab" class="mt-2 text-white/80" data-testid="install-ios">
            Tap the <strong>Share</strong> button, then <strong>Add to Home Screen</strong>.
        </p>
        <div class="mt-3 flex gap-2">
            <button v-if="deferred" type="button" class="h-11 rounded-xl bg-white px-4 font-semibold text-black" data-testid="install-button" @click="install">Install</button>
            <button type="button" class="h-11 rounded-xl px-3 font-medium text-white/60" data-testid="install-dismiss" @click="dismiss">Not now</button>
        </div>
    </div>
</template>
