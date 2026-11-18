<script setup lang="ts">
import { computed } from 'vue';
import type { PeerState, ServerState } from '@/transport/ConnectionStateMachine';

const props = withDefaults(defineProps<{ server: ServerState; peer: PeerState; peerLabel?: string; compact?: boolean }>(), { peerLabel: 'Display', compact: false });

const PEER: Record<PeerState, { text: string; tone: string }> = {
    connected: { text: 'Connected', tone: 'ok' },
    synchronizing: { text: 'Synchronizing', tone: 'busy' },
    reconnecting: { text: 'Reconnecting', tone: 'warn' },
    disconnected: { text: 'Disconnected', tone: 'bad' },
};
const peerInfo = computed(() => PEER[props.peer]);
const serverTone = computed(() => (props.server === 'online' ? 'ok' : 'bad'));
</script>

<template>
    <div class="flex flex-wrap items-center gap-2 text-xs font-semibold" data-testid="connection-badge" role="status" aria-live="polite">
        <span class="pill" :data-tone="serverTone" data-testid="badge-server" :aria-label="`Server ${server}`">
            <i aria-hidden="true"></i>{{ compact ? '' : 'Server · ' }}{{ server === 'online' ? 'Online' : 'Offline' }}
        </span>
        <span class="pill" :data-tone="peerInfo.tone" data-testid="badge-peer" :data-state="peer" :aria-label="`${peerLabel} ${peerInfo.text}`">
            <i aria-hidden="true"></i>{{ peerLabel }} · {{ peerInfo.text }}
        </span>
    </div>
</template>

<style scoped>
.pill {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    border-radius: 999px;
    padding: 0.3rem 0.65rem;
    background: rgb(255 255 255 / 0.08);
    color: #e5e5e5;
    white-space: nowrap;
}
.pill i {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 999px;
    background: currentColor;
}
.pill[data-tone='ok'] {
    color: #4ade80;
}
.pill[data-tone='busy'] {
    color: #60a5fa;
}
.pill[data-tone='warn'] {
    color: #fbbf24;
}
.pill[data-tone='bad'] {
    color: #f87171;
}
.pill[data-tone='busy'] i,
.pill[data-tone='warn'] i {
    animation: pulse 1.2s ease-in-out infinite;
}
@keyframes pulse {
    50% {
        opacity: 0.3;
    }
}
@media (prefers-reduced-motion: reduce) {
    .pill i {
        animation: none !important;
    }
}
</style>
