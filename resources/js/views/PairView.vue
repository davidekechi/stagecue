<script setup lang="ts">
// T7.1 — pair this phone by code, by QR link (#t=…) or with the in-app scanner.
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { guessDeviceName, isIosBrowserTab, isValidCode, normalizeCode, startScanner, tokenFromHash, type ScannerHandle } from '@/control/QrScanner';
import { pairDevice, pairingErrorMessage } from '@/control/pairDevice';
import { ApiClient, ApiError } from '@/transport/ApiClient';
import { getDb } from '@/storage/db';
import { DeviceRepo } from '@/storage/DeviceRepo';
import { MetaRepo } from '@/storage/MetaRepo';

const props = defineProps<{ api?: ApiClient }>();
const router = useRouter();
const route = useRoute();
const REASONS: Record<string, string> = {
    revoked: 'The display unpaired this phone. To use it again, pair with the code on the screen.',
    replaced: 'Another phone was paired with the display, so this one was unpaired.',
    ended: 'The display ended its session, so this phone was unpaired. Pair again with the new code on the screen.',
    left: 'This phone is unpaired.',
};
const reason = computed(() => REASONS[String(route.query.reason ?? '')] ?? null);
const api = props.api ?? new ApiClient();

const code = ref('');
const name = ref(guessDeviceName());
const busy = ref(false);
const error = ref<string | null>(null);
const existing = ref<{ sessionName: string | null } | null>(null);
const scanning = ref(false);
const scanHint = ref<string | null>(null);
const video = ref<HTMLVideoElement | null>(null);
const codeInput = ref<HTMLInputElement | null>(null);
const iosTab = isIosBrowserTab();
let scanner: ScannerHandle | null = null;

const boxes = computed(() => Array.from({ length: 6 }, (_, i) => code.value[i] ?? ''));
const canPair = computed(() => isValidCode(code.value) && name.value.trim().length > 0 && !busy.value);

async function repos() {
    const db = await getDb();
    return { devices: new DeviceRepo(db, 'controller'), meta: new MetaRepo(db) };
}

async function submit(input: { code: string } | { token: string }) {
    busy.value = true;
    error.value = null;
    try {
        const { devices, meta } = await repos();
        await pairDevice({ api, devices, meta }, input, name.value.trim() || 'Phone');
        await router.replace('/control');
    } catch (e) {
        error.value = pairingErrorMessage(e instanceof ApiError ? e.code : undefined);
    } finally {
        busy.value = false;
    }
}

function onCodeInput(e: Event) {
    const el = e.target as HTMLInputElement;
    code.value = normalizeCode(el.value);
    el.value = code.value;
    error.value = null;
    if (isValidCode(code.value) && name.value.trim()) void submit({ code: code.value });
}

async function openScanner() {
    scanHint.value = null;
    scanning.value = true;
    await nextTick();
    try {
        scanner = await startScanner(
            video.value!,
            location.origin,
            (token) => {
                closeScanner();
                void submit({ token });
            },
            () => (scanHint.value = 'That QR code isn’t a StageCue pairing code.'),
        );
    } catch {
        closeScanner();
        error.value = 'The camera isn’t available. Allow camera access, or type the code instead.';
    }
}

function closeScanner() {
    scanner?.stop();
    scanner = null;
    scanning.value = false;
}

onMounted(async () => {
    // A QR link: read the token from the fragment, strip it from the address bar, pair straight away.
    const token = tokenFromHash(location.hash);
    if (location.hash) history.replaceState(history.state, '', location.pathname + location.search);
    if (token) {
        void submit({ token });
        return;
    }
    const current = await (await repos()).devices.get().catch(() => null);
    if (current) existing.value = { sessionName: current.sessionName ?? null };
});
onBeforeUnmount(closeScanner);
</script>

<template>
    <main class="min-h-full bg-desk px-5 pb-10 pt-8 text-ink" data-testid="pair-view">
        <div class="mx-auto flex max-w-sm flex-col gap-7">
            <header>
                <p class="text-sm font-semibold text-muted">StageCue</p>
                <h1 class="mt-1 text-[1.75rem] font-bold leading-tight">Pair this phone</h1>
                <p class="mt-2 text-[0.95rem] leading-relaxed text-muted">Enter the code from the display’s setup panel, or scan its QR code.</p>
            </header>

            <p v-if="reason" class="rounded-2xl border border-standby/50 bg-standby/10 px-4 py-3 text-[0.95rem] leading-snug" role="status" data-testid="pair-reason">{{ reason }}</p>

            <div v-if="existing" class="rounded-2xl bg-panel p-4" data-testid="pair-existing">
                <p class="text-[0.95rem]">This phone is paired with {{ existing.sessionName ?? 'a display' }}.</p>
                <RouterLink to="/control" class="mt-3 flex h-14 items-center justify-center rounded-xl bg-ink text-lg font-semibold text-desk" data-testid="pair-reconnect">Reconnect to {{ existing.sessionName ?? 'the display' }}</RouterLink>
                <p class="mt-2 text-sm text-muted">Pairing with a new code below replaces it.</p>
            </div>

            <form class="flex flex-col gap-5" @submit.prevent="canPair && submit({ code })">
                <label class="flex flex-col gap-2">
                    <span class="text-sm font-medium text-muted">Code</span>
                    <div class="relative" @click="codeInput?.focus()">
                        <input
                            ref="codeInput"
                            :value="code"
                            class="absolute inset-0 h-full w-full opacity-0"
                            inputmode="text"
                            autocapitalize="characters"
                            autocomplete="one-time-code"
                            autocorrect="off"
                            spellcheck="false"
                            maxlength="12"
                            aria-label="Pairing code"
                            data-testid="pair-code"
                            @input="onCodeInput"
                        />
                        <div class="pointer-events-none grid grid-cols-6 gap-2" aria-hidden="true">
                            <span
                                v-for="(c, i) in boxes"
                                :key="i"
                                class="flex h-14 items-center justify-center rounded-xl border-2 text-2xl font-bold tabular"
                                :class="c ? 'border-panel-2 bg-panel text-ink' : i === code.length ? 'border-standby/70 bg-panel' : 'border-panel-2 bg-desk'"
                                >{{ c }}</span>
                        </div>
                    </div>
                </label>

                <label class="flex flex-col gap-2">
                    <span class="text-sm font-medium text-muted">Name shown on the display</span>
                    <input v-model="name" maxlength="60" class="h-12 rounded-xl border-2 border-panel-2 bg-panel px-4 text-base outline-none focus:border-ink/50" data-testid="pair-name" />
                </label>

                <p v-if="error" class="rounded-xl border border-stage-red/50 bg-stage-red/15 px-4 py-3 text-[0.95rem] leading-snug" role="alert" data-testid="pair-error">{{ error }}</p>

                <button type="submit" class="h-14 rounded-xl bg-ink text-lg font-semibold text-desk disabled:opacity-40" :disabled="!canPair" data-testid="pair-submit">
                    {{ busy ? 'Pairing…' : 'Pair' }}
                </button>
                <button type="button" class="h-14 rounded-xl border-2 border-panel-2 text-lg font-semibold" data-testid="pair-scan" @click="openScanner">Scan the QR code</button>
            </form>

            <p v-if="iosTab" class="text-sm leading-relaxed text-muted" data-testid="pair-ios-hint">
                Opened from the Camera app? This Safari tab is separate from the installed StageCue app. Pair here to control from Safari, or open the StageCue app and scan from there.
            </p>
        </div>

        <div v-if="scanning" class="fixed inset-0 z-50 flex flex-col bg-black" data-testid="pair-scanner">
            <video ref="video" class="h-full w-full object-cover" playsinline muted></video>
            <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div class="aspect-square w-64 rounded-3xl border-4 border-ink/80"></div>
            </div>
            <div class="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-5 pb-8">
                <p v-if="scanHint" class="rounded-xl bg-black/70 px-4 py-2 text-center text-sm">{{ scanHint }}</p>
                <button class="h-14 rounded-xl bg-ink text-lg font-semibold text-desk" @click="closeScanner">Cancel</button>
            </div>
        </div>
    </main>
</template>
