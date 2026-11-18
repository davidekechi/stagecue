// LLD §4.2 — readonly projection of the ControllerRuntime, plus the operator's form inputs.
import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import type { CommandName, CommandPayloads, Corner } from '@/core/types';
import type { Conflict, ControllerRuntime, ControllerSink, UnpairReason } from '@/control/ControllerRuntime';
import type { PendingCommand, Terminal } from '@/control/CommandOutbox';
import type { Mirror } from '@/control/MirrorClock';
import type { Draft } from '@/storage/db';
import type { ConnectionStatus } from '@/transport/ConnectionStateMachine';

export interface ControlForm {
    h: number;
    m: number;
    s: number;
    text: string;
    /** null = until dismissed (persistent). */
    durationMs: number | null;
    corner: Corner;
}

export const useControlStore = defineStore('control', () => {
    const mirror = shallowRef<Mirror | null>(null);
    const outbox = shallowRef<PendingCommand[]>([]);
    const connection = ref<ConnectionStatus>({ server: 'offline', peer: 'disconnected' });
    const session = ref<{ sessionName: string; deviceName: string } | null>(null);
    const unpaired = ref<UnpairReason | null>(null);
    const drafts = shallowRef<Draft[]>([]);
    const conflict = shallowRef<Conflict | null>(null);
    const form = ref<ControlForm>({ h: 0, m: 15, s: 0, text: '', durationMs: 10_000, corner: 'tr' });
    let runtime: ControllerRuntime | null = null;

    const canSend = computed(() => connection.value.server === 'online' && (connection.value.peer === 'connected' || connection.value.peer === 'synchronizing'));
    const blackout = computed(() => mirror.value?.state.display.blackout ?? false);

    const sink: ControllerSink = {
        onMirror: (m) => (mirror.value = m),
        onOutbox: (e) => (outbox.value = e),
        onConnection: (s) => (connection.value = s),
        onSession: (s) => (session.value = s),
        onUnpaired: (r) => (unpaired.value = r),
        onConflict: (c) => (conflict.value = c),
    };

    function attach(rt: ControllerRuntime | null) {
        runtime = rt;
    }

    function send<N extends CommandName>(name: N, payload: CommandPayloads[N]): Promise<Terminal> {
        return runtime ? runtime.send(name, payload) : Promise.resolve('failed');
    }

    /** The latest outbox entry for a command name (drives a button's state). */
    function latest(name: CommandName): PendingCommand | undefined {
        return [...outbox.value].reverse().find((e) => e.name === name);
    }

    return {
        mirror,
        outbox,
        connection,
        session,
        unpaired,
        drafts,
        conflict,
        form,
        canSend,
        blackout,
        sink,
        attach,
        send,
        latest,
        retry: (id: string) => runtime?.retry(id) ?? Promise.resolve('failed' as const),
        discard: (id: string) => runtime?.discard(id),
        unpair: () => runtime?.unpair() ?? Promise.resolve(),
        confirmConflict: () => (conflict.value && runtime ? runtime.confirmConflict(conflict.value) : Promise.resolve('failed' as const)),
        dismissConflict: () => (runtime ? runtime.dismissConflict() : (conflict.value = null)),
        runtime: () => runtime,
    };
});
