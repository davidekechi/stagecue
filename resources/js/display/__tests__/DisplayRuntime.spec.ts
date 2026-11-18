import { describe, expect, it, vi } from 'vitest';
import { FakeClock } from '@/core/clock';
import { readout } from '@/core/timer';
import { deriveView } from '@/core/view';
import type { DomainEvent, PresentationState } from '@/core/types';
import { openStageCueDb, type StageCueDB } from '@/storage/db';
import { PresentationRepo } from '@/storage/PresentationRepo';
import { ProcessedCommandRepo } from '@/storage/ProcessedCommandRepo';
import { MetaRepo } from '@/storage/MetaRepo';
import { CommitQueue } from '../commitQueue';
import { catchUp, DisplayRuntime, type DisplayRuntimeDeps } from '../DisplayRuntime';

const T0 = 1_794_660_000_000;
const MSG = '0193a3b4-8c2e-7d11-9f0a-aaaaaaaaaaaa';

/** A scheduler whose timers never fire: tests drive ticks explicitly. */
const inertScheduler = { setTimeout: () => 0, clearTimeout: () => {}, requestAnimationFrame: null, document: null };

async function makeRuntime(clock: FakeClock, db?: StageCueDB, extra: Partial<DisplayRuntimeDeps> = {}) {
    db ??= await openStageCueDb();
    const emitted: Array<{ state: PresentationState; events: DomainEvent[] }> = [];
    const publishNow = vi.fn();
    const rt = new DisplayRuntime({
        clock,
        repo: new PresentationRepo(db),
        processed: new ProcessedCommandRepo(db),
        meta: new MetaRepo(db),
        publisher: { publishNow },
        scheduler: inertScheduler,
        newPresentationId: () => '01JD3S0000000000000000PRES',
        onState: (state, events) => emitted.push({ state, events }),
        ...extra,
    });
    return { rt, db, emitted, publishNow };
}

describe('CommitQueue', () => {
    it('runs tasks one at a time in order, even when one fails', async () => {
        const q = new CommitQueue();
        const log: string[] = [];
        const slow = q.run(async () => {
            await new Promise((r) => setTimeout(r, 5));
            log.push('a');
        });
        const failing = q.run(() => {
            log.push('b');
            throw new Error('x');
        });
        const fast = q.run(() => log.push('c'));
        await slow;
        await expect(failing).rejects.toThrow('x');
        await fast;
        await q.idle();
        expect(log).toEqual(['a', 'b', 'c']);
    });
});

describe('DisplayRuntime (local mode)', () => {
    it('boots a fresh state, persists it and publishes once', async () => {
        const clock = new FakeClock(T0);
        const { rt, db, emitted, publishNow } = await makeRuntime(clock);
        await rt.boot();
        expect(rt.state).toMatchObject({ revision: 0, timer: { status: 'idle' } });
        expect(await new PresentationRepo(db).load()).toEqual(rt.state);
        expect(emitted).toHaveLength(1);
        expect(publishNow).toHaveBeenCalledTimes(1);
        rt.stop();
    });

    it('applies local commands through the queue, persists and publishes', async () => {
        const clock = new FakeClock(T0);
        const { rt, db, publishNow } = await makeRuntime(clock);
        await rt.boot();
        const [a, b] = await Promise.all([rt.local('TIMER_SET', { durationMs: 60_000 }), rt.local('TIMER_START')]);
        expect(a.ok && b.ok).toBe(true);
        expect(rt.state.timer.status).toBe('running');
        expect(rt.state.revision).toBe(2);
        expect((await new PresentationRepo(db).load())?.revision).toBe(2);
        expect(publishNow).toHaveBeenCalledTimes(3);
        const rejected = await rt.local('TIMER_RESUME');
        expect(rejected).toMatchObject({ ok: false, code: 'INVALID_STATE' });
        expect(rt.state.revision).toBe(2);
        rt.stop();
    });

    it('a reload in the middle of any state reproduces it', async () => {
        const clock = new FakeClock(T0);
        const db = await openStageCueDb();
        const { rt } = await makeRuntime(clock, db);
        await rt.boot();
        await rt.local('TIMER_SET', { durationMs: 900_000 });
        await rt.local('TIMER_START');
        clock.advance(60_000);
        await rt.local('TIMER_PAUSE');
        await rt.local('MESSAGE_SHOW', { id: MSG, text: 'Hi', mode: 'persistent', corner: 'bl' });
        await rt.local('BLACKOUT_ON');
        rt.stop();

        clock.advance(30_000);
        const { rt: again } = await makeRuntime(clock, db);
        await again.boot();
        expect(again.state).toEqual(rt.state);
        again.stop();
    });

    it('OFF-05 (unit) reload while running + showing a message: same remaining time, original message expiry', async () => {
        const clock = new FakeClock(T0);
        const db = await openStageCueDb();
        const { rt } = await makeRuntime(clock, db);
        await rt.boot();
        await rt.local('TIMER_SET', { durationMs: 900_000 });
        await rt.local('TIMER_START');
        await rt.local('MESSAGE_SHOW', { id: MSG, text: 'Seats', mode: 'timed', durationMs: 30_000 });
        clock.advance(10_000);
        const before = readout(rt.state.timer, rt.nowEff())!.remainingMs;
        rt.stop();

        clock.advance(2_000); // the reload takes 2 s
        const { rt: again } = await makeRuntime(clock, db);
        await again.boot();
        expect(readout(again.state.timer, again.nowEff())!.remainingMs).toBe(before - 2_000);
        expect(again.state.message).toMatchObject({ status: 'showing', expiresAtWall: T0 + 30_000 });
        again.stop();
    });

    it('CLK-05 boot catch-up: timer ended 2 min ago, message 1 min ago → ordered, overtime +00:02:00, message gone', async () => {
        const clock = new FakeClock(T0);
        const db = await openStageCueDb();
        const { rt } = await makeRuntime(clock, db);
        await rt.boot();
        await rt.local('TIMER_SET', { durationMs: 60_000 });
        await rt.local('TIMER_START');
        await rt.local('MESSAGE_SHOW', { id: MSG, text: 'Hi', mode: 'timed', durationMs: 120_000 });
        rt.stop();

        clock.advance(180_000); // closed for 3 min: timer ended at +1 min (2 min ago), message at +2 min (1 min ago)
        const { rt: again, emitted } = await makeRuntime(clock, db);
        await again.boot();
        expect(emitted[0]?.events).toEqual(['TimerExpired', 'OvertimeStarted', 'MessageExpired']);
        expect(again.state.message.status).toBe('none');
        expect(deriveView(again.state, again.nowEff())).toEqual({ kind: 'overtime', text: '+00:02:00', paused: false });
        again.stop();
    });

    it('catch-up order matters for A2 with overtimeInterruptsMessage', () => {
        const base: PresentationState = {
            schema: 1,
            presentationId: 'P',
            revision: 3,
            display: { blackout: false },
            settings: { defaultCorner: 'tr', overtimeInterruptsMessage: true, defaultMessageDurationMs: 10_000 },
            timer: { status: 'running', durationMs: 60_000, startedAtWall: T0, endsAtWall: T0 + 60_000 },
            message: { status: 'showing', id: MSG, text: 'x', mode: 'timed', durationMs: 30_000, shownAtWall: T0, expiresAtWall: T0 + 30_000, corner: 'tr' },
            updatedAtWall: T0,
        };
        const r = catchUp(base, T0 + 120_000);
        expect(r.events).toEqual(['MessageExpired', 'TimerExpired', 'OvertimeStarted']);
        expect(r.state.revision).toBe(5);
    });

    it('raises each expiry exactly once from the tick', async () => {
        const clock = new FakeClock(T0);
        const { rt, emitted } = await makeRuntime(clock);
        await rt.boot();
        await rt.local('TIMER_SET', { durationMs: 3_000 });
        await rt.local('TIMER_START');
        for (let i = 0; i < 6; i++) {
            clock.advance(1_000);
            rt.tick();
            await rt.idle();
        }
        const expiries = emitted.filter((e) => e.events.includes('TimerExpired'));
        expect(expiries).toHaveLength(1);
        expect(rt.state).toMatchObject({ revision: 3, timer: { status: 'overtime' } });
        rt.stop();
    });

    it('rebases the state on a system clock change during a tick (revision++, ClockAdjusted)', async () => {
        const clock = new FakeClock(T0);
        const nows: number[] = [];
        const { rt, emitted } = await makeRuntime(clock, undefined, { onNow: (n) => nows.push(n) });
        await rt.boot();
        await rt.local('TIMER_SET', { durationMs: 900_000 });
        await rt.local('TIMER_START');
        clock.advance(1_000);
        rt.tick();
        const remaining = readout(rt.state.timer, rt.nowEff())!.remainingMs;
        clock.advance(1_000);
        clock.jumpWall(3 * 3600_000);
        rt.tick();
        await rt.idle();
        expect(emitted.at(-1)?.events).toEqual(['ClockAdjusted']);
        expect(rt.state.revision).toBe(3);
        expect(readout(rt.state.timer, rt.nowEff())!.remainingMs).toBe(remaining - 1_000);
        expect(rt.state.timer.status).toBe('running');
        expect(nows.at(-1)).toBe(clock.wallNow());
        rt.stop();
    });

    it('S-07 keeps running in memory when IndexedDB writes fail, and raises the warning', async () => {
        const clock = new FakeClock(T0);
        const db = await openStageCueDb();
        const repo = new PresentationRepo(db);
        const warnings = vi.fn();
        const { rt } = await makeRuntime(clock, db, { repo, onWarning: warnings });
        vi.spyOn(console, 'error').mockImplementation(() => {});
        await rt.boot();
        vi.spyOn(repo, 'commit').mockRejectedValue(new DOMException('full', 'QuotaExceededError'));
        await rt.local('TIMER_SET', { durationMs: 60_000 });
        await rt.local('TIMER_START');
        expect(rt.state.timer.status).toBe('running');
        expect(rt.getWarnings().storageFailed).toBe(true);
        expect(warnings).toHaveBeenLastCalledWith({ storageFailed: true, recoveredFromCorrupt: false });
        expect(await new MetaRepo(db).errors()).not.toHaveLength(0);
        rt.stop();
    });

    it('reports a quarantined corrupt record as a warning and starts fresh', async () => {
        const clock = new FakeClock(T0);
        const db = await openStageCueDb();
        await db.put('presentation', { broken: true }, 'current');
        const { rt } = await makeRuntime(clock, db);
        await rt.boot();
        expect(rt.getWarnings().recoveredFromCorrupt).toBe(true);
        expect(rt.state.revision).toBe(0);
        rt.stop();
    });

    it('blackout survives ticks across expiry and a reload', async () => {
        const clock = new FakeClock(T0);
        const db = await openStageCueDb();
        const { rt } = await makeRuntime(clock, db);
        await rt.boot();
        await rt.local('TIMER_SET', { durationMs: 2_000 });
        await rt.local('TIMER_START');
        await rt.local('BLACKOUT_ON');
        for (let i = 0; i < 4; i++) {
            clock.advance(1_000);
            rt.tick();
        }
        await rt.idle();
        expect(rt.state).toMatchObject({ display: { blackout: true }, timer: { status: 'overtime' } });
        rt.stop();
        const { rt: again } = await makeRuntime(clock, db);
        await again.boot();
        expect(deriveView(again.state, again.nowEff()).kind).toBe('black');
        await again.local('BLACKOUT_OFF');
        expect(deriveView(again.state, again.nowEff())).toMatchObject({ kind: 'overtime', text: '+00:00:02' });
        again.stop();
    });

    it('wake() ticks immediately once booted', async () => {
        const clock = new FakeClock(T0);
        const onNow = vi.fn();
        const { rt } = await makeRuntime(clock, undefined, { onNow });
        rt.wake();
        expect(onNow).not.toHaveBeenCalled();
        await rt.boot();
        const calls = onNow.mock.calls.length;
        rt.wake();
        expect(onNow.mock.calls.length).toBe(calls + 1);
        rt.stop();
    });
});
