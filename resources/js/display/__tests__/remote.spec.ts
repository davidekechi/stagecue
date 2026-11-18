import { describe, expect, it, vi } from 'vitest';
import { FakeClock } from '@/core/clock';
import type { Ack, CommandEnvelope } from '@/core/types';
import { openStageCueDb } from '@/storage/db';
import { PresentationRepo } from '@/storage/PresentationRepo';
import { ProcessedCommandRepo } from '@/storage/ProcessedCommandRepo';
import { ApiError } from '@/transport/ApiClient';
import { DisplayRuntime } from '../DisplayRuntime';
import { SnapshotPublisher } from '../SnapshotPublisher';

const T0 = 1_794_660_000_000;
const SID = '01JD3Q8Z6R0V5M8K2Y7T1N4B9C';
let n = 0;
const env = (name: CommandEnvelope['name'], payload: unknown = {}, over: Partial<CommandEnvelope> = {}): CommandEnvelope => ({
    v: 1,
    type: 'command',
    sessionId: SID,
    commandId: `0193a3b4-8c2e-7d11-9f0a-${String(++n).padStart(12, '0')}`,
    seq: n,
    name,
    payload,
    baseRevision: null,
    issuer: { deviceId: 'C', role: 'controller' },
    issuedAt: T0,
    relayedAt: T0,
    ...over,
});

async function setup(serverNow: () => number | null = () => null) {
    const clock = new FakeClock(T0);
    const db = await openStageCueDb();
    const acks: Ack[] = [];
    const publishNow = vi.fn((ack?: Ack) => ack && acks.push(ack));
    const rt = new DisplayRuntime({
        clock,
        repo: new PresentationRepo(db),
        processed: new ProcessedCommandRepo(db),
        publisher: { publishNow },
        scheduler: { setTimeout: () => 0, clearTimeout: () => {}, requestAnimationFrame: null, document: null },
        serverNow,
        sessionId: () => SID,
    });
    await rt.boot();
    return { rt, acks, publishNow, clock, db };
}

describe('DisplayRuntime.handleRemote', () => {
    it('applies a remote command, persists the processed record and acks APPLIED', async () => {
        const { rt, acks, db } = await setup();
        const e = env('TIMER_SET', { durationMs: 60_000 });
        await rt.handleRemote(e);
        expect(rt.state.timer).toEqual({ status: 'ready', durationMs: 60_000 });
        expect(acks).toEqual([{ commandId: e.commandId, seq: e.seq, result: 'APPLIED' }]);
        expect(await new ProcessedCommandRepo(db).get(e.commandId)).toMatchObject({ result: 'APPLIED' });
        rt.stop();
    });

    it('S-04 a duplicate commandId is applied once; the second ack is DUPLICATE', async () => {
        const { rt, acks } = await setup();
        const e = env('BLACKOUT_ON');
        await Promise.all([rt.handleRemote(e), rt.handleRemote(e)]);
        expect(rt.state.revision).toBe(1);
        expect(acks.map((a) => a.result)).toEqual(['APPLIED', 'DUPLICATE']);
        rt.stop();
    });

    it('a rejected command is remembered: a retry gets the same answer', async () => {
        const { rt, acks } = await setup();
        const e = env('TIMER_START');
        await rt.handleRemote(e);
        await rt.handleRemote(e);
        expect(acks).toEqual([
            { commandId: e.commandId, seq: e.seq, result: 'REJECTED', code: 'INVALID_STATE', message: expect.any(String) },
            { commandId: e.commandId, seq: e.seq, result: 'REJECTED', code: 'INVALID_STATE', message: expect.any(String) },
        ]);
        rt.stop();
    });

    it('S-05 relayedAt 11 s old by server time (with a clock offset) → STALE', async () => {
        // The Display's wall clock is 5 minutes slow; the server clock is what counts.
        const { rt, acks } = await setup(() => T0 + 300_000);
        await rt.handleRemote(env('BLACKOUT_ON', {}, { relayedAt: T0 + 300_000 - 11_000 }));
        expect(acks[0]).toMatchObject({ result: 'REJECTED', code: 'STALE' });
        expect(rt.state.display.blackout).toBe(false);
        await rt.handleRemote(env('BLACKOUT_ON', {}, { relayedAt: T0 + 300_000 - 9_000 }));
        expect(acks[1]).toMatchObject({ result: 'APPLIED' });
        rt.stop();
    });

    it('skips the staleness check when the server clock is unknown', async () => {
        const { rt, acks } = await setup(() => null);
        await rt.handleRemote(env('BLACKOUT_ON', {}, { relayedAt: 0 }));
        expect(acks[0]?.result).toBe('APPLIED');
        rt.stop();
    });

    it('rejects STALE_VIEW and INVALID_PAYLOAD, acks no-ops, and ignores other sessions', async () => {
        const { rt, acks } = await setup();
        await rt.handleRemote(env('TIMER_SET', { durationMs: 60_000 }));
        await rt.handleRemote(env('TIMER_START'));
        await rt.handleRemote(env('TIMER_RESET', {}, { baseRevision: 1 }));
        await rt.handleRemote(env('TIMER_SET', { durationMs: 5 }));
        await rt.handleRemote(env('SYNC_REQUEST'));
        await rt.handleRemote(env('BLACKOUT_ON', {}, { sessionId: 'OTHER' }));
        expect(acks.map((a) => a.code ?? a.result)).toEqual(['APPLIED', 'APPLIED', 'STALE_VIEW', 'INVALID_PAYLOAD', 'APPLIED']);
        expect(rt.state.display.blackout).toBe(false);
        rt.stop();
    });

    it('builds a snapshot with computed timing', async () => {
        const { rt, clock } = await setup();
        await rt.handleRemote(env('TIMER_SET', { durationMs: 60_000 }));
        await rt.handleRemote(env('TIMER_START'));
        clock.advance(1_500);
        const s = rt.snapshot();
        expect(s).toMatchObject({ v: 1, revision: 2, presentationId: rt.state.presentationId, lastEvents: ['TimerStarted'], computed: { timerRemainingMs: 58_500, overtimeMs: 0, messageRemainingMs: null } });
        expect(s.capturedAtWall).toBe(T0 + 1_500);
        rt.stop();
    });
});

describe('SnapshotPublisher', () => {
    const build = () => ({ v: 1 as const, presentationId: 'P', revision: 1, capturedAtWall: 0, state: {} as never, computed: { timerRemainingMs: null, overtimeMs: 0, messageRemainingMs: null }, lastEvents: [] });
    const ack = (i: number): Ack => ({ commandId: `c${i}`, result: 'APPLIED' });

    it('S-06 10 publishes while one is in flight → 2 requests, the last carries all acks', async () => {
        const resolvers: Array<() => void> = [];
        const post = vi.fn(() => new Promise<void>((r) => resolvers.push(r)));
        const p = new SnapshotPublisher({ build, post, enabled: () => true });
        p.publishNow(ack(0));
        for (let i = 1; i <= 10; i++) p.publishNow(ack(i));
        expect(post).toHaveBeenCalledTimes(1);
        resolvers[0]!();
        await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(2));
        resolvers[1]!();
        await Promise.resolve();
        expect((post.mock.calls[0] as unknown as [{ acks: Ack[] }])[0].acks.map((a) => a.commandId)).toEqual(['c0']);
        expect((post.mock.calls[1] as unknown as [{ acks: Ack[] }])[0].acks.map((a) => a.commandId)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10']);
        expect(post).toHaveBeenCalledTimes(2);
    });

    it('keeps acks while disabled and sends them once enabled', async () => {
        let enabled = false;
        const post = vi.fn(async () => undefined);
        const p = new SnapshotPublisher({ build, post, enabled: () => enabled });
        p.publishNow(ack(1));
        expect(post).not.toHaveBeenCalled();
        enabled = true;
        p.flush();
        await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
        expect((post.mock.calls[0] as unknown as [{ acks: Ack[] }])[0].acks).toHaveLength(1);
    });

    it('backs off on retryable failures, keeps the acks, latest wins; flush sends at once', async () => {
        let timer: (() => void) | null = null;
        const delays: number[] = [];
        let fail = true;
        const post = vi.fn(async () => {
            if (fail) throw new ApiError(0, 'NETWORK', 'x', true);
        });
        const onError = vi.fn();
        const p = new SnapshotPublisher({
            build,
            post,
            enabled: () => true,
            onError,
            random: () => 0.5,
            setTimeout: (fn, ms) => ((timer = fn), delays.push(ms), 1),
            clearTimeout: () => (timer = null),
        });
        p.publishNow(ack(1));
        await vi.waitFor(() => expect(delays).toEqual([1_000]));
        p.publishNow(ack(2)); // queued behind the back-off
        expect(post).toHaveBeenCalledTimes(1);
        timer!();
        await vi.waitFor(() => expect(delays).toEqual([1_000, 2_000]));
        fail = false;
        p.flush();
        await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(3));
        expect((post.mock.calls[2] as unknown as [{ acks: Ack[] }])[0].acks.map((a) => a.commandId)).toEqual(['c1', 'c2']);
        expect(onError).toHaveBeenCalledTimes(2);
    });

    it('reports auth loss and drops non-retryable snapshots', async () => {
        const onAuthLoss = vi.fn();
        const onError = vi.fn();
        const p = new SnapshotPublisher({ build, enabled: () => true, onAuthLoss, onError, post: async () => { throw new ApiError(401, 'UNAUTHENTICATED', 'x', false); } });
        p.publishNow(ack(1));
        await vi.waitFor(() => expect(onAuthLoss).toHaveBeenCalledTimes(1));
        expect(p.queuedAcks).toBe(1);
        const q = new SnapshotPublisher({ build, enabled: () => true, onError, post: async () => { throw new ApiError(422, 'VALIDATION_FAILED', 'x', false); } });
        q.publishNow(ack(1));
        await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
        expect(q.queuedAcks).toBe(0);
    });

    it('re-publishes every 30 s', () => {
        let periodic: (() => void) | null = null;
        const post = vi.fn(async () => undefined);
        const p = new SnapshotPublisher({ build, post, enabled: () => true, setInterval: (fn, ms) => (expect(ms).toBe(30_000), (periodic = fn), 1), clearInterval: () => (periodic = null) });
        p.start();
        periodic!();
        expect(post).toHaveBeenCalledTimes(1);
        p.stop();
        expect(periodic).toBeNull();
    });
});

describe('T9.4 apply latency', () => {
    it('reports relay→apply latency on the server clock for 1 in 10 applied commands', async () => {
        const { rt, acks } = await setup(() => T0 + 250);
        for (let i = 0; i < 11; i++) await rt.handleRemote(env(i % 2 ? 'BLACKOUT_ON' : 'BLACKOUT_OFF', {}, { relayedAt: T0 + 100 }));
        const withLatency = acks.filter((a) => a.latencyMs !== undefined);
        expect(withLatency.map((a) => a.latencyMs)).toEqual([150, 150]); // the 1st and the 11th
        rt.stop();
    });

    it('omits latency when the server clock is unknown', async () => {
        const { rt, acks } = await setup(() => null);
        await rt.handleRemote(env('BLACKOUT_ON'));
        expect(acks[0]?.latencyMs).toBeUndefined();
        rt.stop();
    });
});
