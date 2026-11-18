import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { PeerState, ServerState } from '@/transport/ConnectionStateMachine';
import type { SocketState } from '@/transport/RealtimeClient';

/** LLD §4.2 — connection indicators (visible on the Controller, only in the SetupPanel on the Display). */
export const useConnectionStore = defineStore('connection', () => {
    const server = ref<ServerState>('offline');
    const peer = ref<PeerState>('disconnected');
    const socketState = ref<SocketState>('initialized');
    const lastPeerHeartbeatAt = ref<number | null>(null);
    return { server, peer, socketState, lastPeerHeartbeatAt };
});
