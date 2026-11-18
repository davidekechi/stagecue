// LLD §4.2 — a thin, readonly projection of the DisplayRuntime. The per-second `now` write is the
// only reactive update on a tick; the state is a shallowRef replaced wholesale on each commit.
import { defineStore } from 'pinia';
import { computed, ref, shallowReadonly, shallowRef } from 'vue';
import { deriveView, type View } from '@/core/view';
import type { ApplyResult, CommandName, CommandPayloads, DomainEvent, PresentationState } from '@/core/types';
import type { DisplayRuntime, RuntimeWarnings } from '@/display/DisplayRuntime';

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
    let runtime: DisplayRuntime | null = null;

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
        sink,
        attach,
        localCommand,
        runtime: () => runtime,
    };
});
