// LLD §4.2 — a thin, readonly projection of the DisplayRuntime. The per-second `now` write is the
// only reactive update on a tick; the state is a shallowRef replaced wholesale on each commit.
import { defineStore } from 'pinia';
import { computed, ref, shallowReadonly, shallowRef } from 'vue';
import { deriveView, type View } from '@/core/view';
import type { ApplyResult, CommandName, CommandPayloads, DomainEvent, PresentationState } from '@/core/types';
import type { DisplayRuntime, RuntimeWarnings } from '@/display/DisplayRuntime';
import type { DisplayController, DisplayPairing, DisplaySession, DisplaySessionSink, SessionPhase } from '@/display/DisplaySession';
import type { ConnectionStatus } from '@/transport/ConnectionStateMachine';

export interface DisplaySink {
    onState(state: PresentationState, events: DomainEvent[]): void;
    onNow(now: number): void;
    onWarning(warnings: RuntimeWarnings): void;
}

export const useDisplayStore = defineStore('display', () => {
    const _state = shallowRef<PresentationState | null>(null);
    const _now = ref(0);
    const _lastEvents = shallowRef<DomainEvent[]>([]);
    const _warnings = shallowRef<RuntimeWarnings>({ storageFailed: false, recoveredFromCorrupt: false });
    const fullscreen = ref(false);
    const wakeLock = ref<'active' | 'released' | 'unsupported'>('released');
    /** `navigator.storage.persist()` result: null = API unavailable. */
    const storagePersisted = ref<boolean | null>(null);
    /** Result of the single-tab lock taken by the /display route guard. */
    const lock = ref<'pending' | 'acquired' | 'busy' | 'unsupported'>('pending');
    let runtime: DisplayRuntime | null = null;
    let session: DisplaySession | null = null;
    const phase = ref<SessionPhase>('offline');
    const phaseDetail = ref<string | null>(null);
    const sessionInfo = ref<{ sessionId: string; displayName: string } | null>(null);
    const pairing = ref<DisplayPairing | null>(null);
    const controllers = ref<DisplayController[]>([]);
    /** The most recently paired phone (kept for older views). */
    const controller = computed(() => controllers.value.at(-1) ?? null);
    const connection = ref<ConnectionStatus>({ server: 'offline', peer: 'disconnected' });
    const socketState = ref<string>('initialized');

    const sessionSink: DisplaySessionSink = {
        onPhase(p, detail) {
            phase.value = p;
            phaseDetail.value = detail ?? null;
        },
        onSession(info) {
            sessionInfo.value = info;
        },
        onPairing(p) {
            pairing.value = p;
        },
        onControllers(list) {
            controllers.value = list;
        },
        onConnection(s) {
            connection.value = s;
        },
        onSocket(s) {
            socketState.value = s;
        },
    };

    function attachSession(s: DisplaySession | null): void {
        session = s;
    }

    function regenerateCode(): Promise<void> {
        return session?.regeneratePairing() ?? Promise.resolve();
    }

    function revokeController(deviceId?: string): Promise<void> {
        return session?.revokeController(deviceId) ?? Promise.resolve();
    }

    const view = computed<View>(() => (_state.value ? deriveView(_state.value, _now.value) : { kind: 'standby' }));

    /** Callbacks to hand to the DisplayRuntime constructor. */
    const sink: DisplaySink = {
        onState(state, events) {
            _state.value = state;
            _lastEvents.value = events;
        },
        onNow(now) {
            _now.value = now;
        },
        onWarning(warnings) {
            _warnings.value = warnings;
        },
    };

    function attach(rt: DisplayRuntime | null): void {
        runtime = rt;
    }

    function localCommand<N extends CommandName>(name: N, payload?: CommandPayloads[N]): Promise<ApplyResult | null> {
        return runtime ? runtime.local(name, payload ?? ({} as CommandPayloads[N])) : Promise.resolve(null);
    }

    return {
        state: shallowReadonly(_state),
        now: shallowReadonly(_now),
        lastEvents: shallowReadonly(_lastEvents),
        warnings: shallowReadonly(_warnings),
        view,
        fullscreen,
        wakeLock,
        storagePersisted,
        lock,
        sink,
        attach,
        phase,
        phaseDetail,
        sessionInfo,
        pairing,
        controller,
        controllers,
        connection,
        socketState,
        sessionSink,
        attachSession,
        regenerateCode,
        revokeController,
        localCommand,
        runtime: () => runtime,
    };
});
