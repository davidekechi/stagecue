import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { isReactive, watch, nextTick } from 'vue';
import { FakeClock } from '@/core/clock';
import { openStageCueDb } from '@/storage/db';
import { PresentationRepo } from '@/storage/PresentationRepo';
import { ProcessedCommandRepo } from '@/storage/ProcessedCommandRepo';
import { DisplayRuntime } from '@/display/DisplayRuntime';
import { useDisplayStore } from '../display';

const T0 = 1_794_660_000_000;

async function setup() {
    const store = useDisplayStore();
    const clock = new FakeClock(T0);
    const db = await openStageCueDb();
    const rt = new DisplayRuntime({
        clock,
        repo: new PresentationRepo(db),
        processed: new ProcessedCommandRepo(db),
        scheduler: { setTimeout: () => 0, clearTimeout: () => {}, requestAnimationFrame: null, document: null },
        ...store.sink,
    });
    store.attach(rt);
    await rt.boot();
    return { store, clock, rt };
}

describe('display store', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('starts on standby with no runtime attached', async () => {
        const store = useDisplayStore();
        expect(store.view).toEqual({ kind: 'standby' });
        expect(await store.localCommand('TIMER_START')).toBeNull();
    });

    it('reflects the runtime emissions: state, view and now', async () => {
        const { store, clock, rt } = await setup();
        expect(store.state?.revision).toBe(0);
        await store.localCommand('TIMER_SET', { durationMs: 900_000 });
        expect(store.view).toEqual({ kind: 'timer', text: '15:00', paused: true, overtime: false });
        await store.localCommand('TIMER_START');
        clock.advance(1_000);
        rt.tick();
        await rt.idle();
        expect(store.now).toBe(T0 + 1_000);
        expect(store.view).toMatchObject({ kind: 'timer', text: '14:59' });
        expect(store.lastEvents).toEqual(['TimerStarted']);
        rt.stop();
    });

    it('a tick only writes `now`; the state object is replaced, never deep-mutated', async () => {
        const { store, clock, rt } = await setup();
        await store.localCommand('TIMER_SET', { durationMs: 60_000 });
        await store.localCommand('TIMER_START');
        const stateRef = store.state;
        let stateChanges = 0;
        const stop = watch(() => store.state, () => stateChanges++);
        for (let i = 0; i < 5; i++) {
            clock.advance(1_000);
            rt.tick();
        }
        await rt.idle();
        await nextTick();
        expect(stateChanges).toBe(0);
        expect(store.state).toBe(stateRef);
        expect(isReactive(store.state)).toBe(false); // no deep proxies on the presentation state
        stop();
        rt.stop();
    });

    it('exposes runtime warnings', async () => {
        const { store, rt } = await setup();
        store.sink.onWarning({ storageFailed: true, recoveredFromCorrupt: false });
        expect(store.warnings.storageFailed).toBe(true);
        expect(store.runtime()).toBe(rt);
        rt.stop();
    });
});
