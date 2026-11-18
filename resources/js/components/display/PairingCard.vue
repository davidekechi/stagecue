<script setup lang="ts">
// T6.6 — QR + 6-character code, expiry countdown, regenerate / revoke, controller status.
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
        controller: DisplayController | null;
        connection: ConnectionStatus;
        now?: () => number;
    }>(),
    { phaseDetail: null, now: () => Date.now() },
);
const emit = defineEmits<{ regenerate: []; revoke: [] }>();

const qr = ref<string | null>(null);
const remaining = ref(0);
const confirmRevoke = ref(false);
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

function revoke() {
    if (!confirmRevoke.value) {
        confirmRevoke.value = true;
        setTimeout(() => (confirmRevoke.value = false), 4_000);
        return;
    }
    confirmRevoke.value = false;
    emit('revoke');
}
</script>

<template>
    <div class="space-y-3" data-testid="pairing-card" :data-phase="phase">
        <ConnectionBadge :server="connection.server" :peer="connection.peer" peer-label="Controller" />

        <p v-if="phase === 'offline'" class="text-sm text-neutral-400" data-testid="pairing-offline">Offline — running in local mode. Pairing becomes available when the network returns.</p>
        <p v-else-if="phase === 'connecting'" class="text-sm text-neutral-400">Connecting to StageCue…</p>
        <p v-else-if="phase === 'error'" class="text-sm text-amber-300" data-testid="pairing-error">Can’t reach StageCue right now. Retrying… The display keeps working.</p>

        <div v-if="controller" class="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2" data-testid="controller-connected">
            <p class="text-sm text-emerald-200">
                Controller connected: <strong class="text-white">{{ controller.name }}</strong>
            </p>
            <button class="mt-2 rounded-md border px-2.5 py-1 text-xs font-medium" :class="confirmRevoke ? 'border-red-500/60 bg-red-500/15 text-red-200' : 'border-white/20 text-neutral-200 hover:bg-white/10'" data-testid="pairing-revoke" @click="revoke">
                {{ confirmRevoke ? 'Click again to disconnect it' : 'Disconnect controller' }}
            </button>
        </div>

        <div v-if="pairing" class="space-y-3" data-testid="pairing-secrets">
            <p class="text-sm text-neutral-300">{{ controller ? 'To use another phone instead:' : 'On your phone, open StageCue → Controller and scan, or type the code.' }}</p>
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
