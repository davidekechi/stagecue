<script setup lang="ts">
// T6.6 — QR + 6-character code, expiry countdown, regenerate / revoke, controller status.
// A28 — several phones: a list with per-phone status and Remove, plus Unpair all. A code is always offered.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import QRCode from 'qrcode';
import ConnectionBadge from '@/components/common/ConnectionBadge.vue';
import type { DisplayController, DisplayPairing, SessionPhase } from '@/display/DisplaySession';
import type { ConnectionStatus } from '@/transport/ConnectionStateMachine';

const props = withDefaults(
    defineProps<{
        phase: SessionPhase;
        phaseDetail?: string | null;
        pairing: DisplayPairing | null;
        controllers: DisplayController[];
        connection: ConnectionStatus;
        /** The live channel (WebSocket) is up. */
        liveLink?: boolean;
        now?: () => number;
    }>(),
    { phaseDetail: null, liveLink: true, now: () => Date.now() },
);
const emit = defineEmits<{ regenerate: []; revoke: [deviceId?: string] }>();

const qr = ref<string | null>(null);
const remaining = ref(0);
/** Which unpair is waiting for its confirming second click: a device id, or 'all'. */
const confirmRevoke = ref<string | null>(null);
let timer: ReturnType<typeof setInterval> | null = null;

watch(
    () => props.pairing?.url,
    async (url) => {
        qr.value = url ? await QRCode.toDataURL(url, { margin: 1, width: 480, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } }).catch(() => null) : null;
    },
    { immediate: true },
);

const tick = () => (remaining.value = props.pairing ? Math.max(0, props.pairing.expiresAt - props.now()) : 0);
onMounted(() => {
    tick();
    timer = setInterval(tick, 1_000);
});
onBeforeUnmount(() => timer && clearInterval(timer));
watch(() => props.pairing, tick);

const countdown = computed(() => {
    const s = Math.ceil(remaining.value / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
});
const codeChars = computed(() => (props.pairing?.code ?? '').split(''));

function revoke(target: string) {
    if (confirmRevoke.value !== target) {
        confirmRevoke.value = target;
        setTimeout(() => confirmRevoke.value === target && (confirmRevoke.value = null), 4_000);
        return;
    }
    confirmRevoke.value = null;
    emit('revoke', target === 'all' ? undefined : target);
}
</script>

<template>
    <div class="space-y-3" data-testid="pairing-card" :data-phase="phase">
        <ConnectionBadge :server="connection.server" :peer="connection.peer" peer-label="Controller" />

        <p v-if="phase === 'offline'" class="text-sm text-neutral-400" data-testid="pairing-offline">Offline — running in local mode. Pairing becomes available when the network returns.</p>
        <p v-else-if="phase === 'connecting'" class="text-sm text-neutral-400">Connecting to StageCue…</p>
        <p v-else-if="phase === 'error'" class="text-sm text-amber-300" data-testid="pairing-error">Can’t reach StageCue right now. Retrying… The display keeps working.</p>
        <p v-else-if="phase === 'ready' && !liveLink" class="text-sm text-amber-300" data-testid="pairing-link-down">
            The live connection is down, so the phone can’t control this display right now. Pairing still works and is kept. Retrying…
        </p>

        <div v-if="controllers.length" class="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2" data-testid="controller-connected">
            <p class="text-sm text-emerald-200">
                {{ controllers.length === 1 ? `Paired with ${controllers[0]!.name}` : `Paired with ${controllers.length} phones` }}
                <span class="block text-xs text-neutral-300" data-testid="controller-link">
                    {{ connection.peer === 'connected' ? 'Any of them can control this display.' : 'None connected right now. They stay paired and reconnect by themselves.' }}
                </span>
            </p>
            <ul class="mt-2 space-y-1.5" data-testid="controller-list">
                <li v-for="c in controllers" :key="c.id" class="flex items-center justify-between gap-3" data-testid="controller-item" :data-online="!!c.online">
                    <span class="flex min-w-0 items-center gap-2 text-sm">
                        <span class="h-2 w-2 shrink-0 rounded-full" :class="c.online ? 'bg-emerald-400' : 'bg-neutral-500'" aria-hidden="true"></span>
                        <strong class="truncate text-white">{{ c.name }}</strong>
                        <span class="shrink-0 text-xs text-neutral-400">{{ c.online ? 'online' : 'not connected' }}</span>
                    </span>
                    <button
                        class="shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium"
                        :class="confirmRevoke === c.id ? 'border-red-500/60 bg-red-500/15 text-red-200' : 'border-white/20 text-neutral-200 hover:bg-white/10'"
                        data-testid="pairing-revoke-one"
                        @click="revoke(c.id)"
                    >
                        {{ confirmRevoke === c.id ? 'Click again' : 'Unpair' }}
                    </button>
                </li>
            </ul>
            <button
                v-if="controllers.length > 1"
                class="mt-2 rounded-md border px-2.5 py-1 text-xs font-medium"
                :class="confirmRevoke === 'all' ? 'border-red-500/60 bg-red-500/15 text-red-200' : 'border-white/20 text-neutral-200 hover:bg-white/10'"
                data-testid="pairing-revoke"
                @click="revoke('all')"
            >
                {{ confirmRevoke === 'all' ? 'Click again to unpair every phone' : 'Unpair all phones' }}
            </button>
        </div>

        <div v-if="pairing" class="space-y-3" data-testid="pairing-secrets">
            <p class="text-sm text-neutral-300">{{ controllers.length ? 'To add another phone, scan or type this code on it:' : 'On your phone, open StageCue → Controller and scan, or type the code.' }}</p>
            <div class="flex items-start gap-4">
                <img v-if="qr" :src="qr" alt="Pairing QR code" class="h-32 w-32 rounded-lg bg-white p-1" data-testid="pairing-qr" />
                <div class="min-w-0">
                    <p class="flex gap-1 font-mono text-3xl font-bold tracking-wider text-white" data-testid="pairing-code" :aria-label="`Pairing code ${pairing.code.split('').join(' ')}`">
                        <span v-for="(c, i) in codeChars" :key="i" class="rounded bg-white/10 px-1.5">{{ c }}</span>
                    </p>
                    <p class="mt-2 text-xs text-neutral-400 tabular" data-testid="pairing-expiry">Expires in {{ countdown }}</p>
                    <button class="mt-2 rounded-md border border-white/20 px-2.5 py-1 text-xs font-medium text-neutral-200 hover:bg-white/10" data-testid="pairing-regenerate" @click="emit('regenerate')">New code</button>
                </div>
            </div>
        </div>
    </div>
</template>
