import { describe, expect, it, vi } from 'vitest';
import { FakeClock } from '@/core/clock';
import { openStageCueDb } from '@/storage/db';
import { DeviceRepo } from '@/storage/DeviceRepo';
import { MetaRepo } from '@/storage/MetaRepo';
import { PresentationRepo } from '@/storage/PresentationRepo';
import { ProcessedCommandRepo } from '@/storage/ProcessedCommandRepo';
import { ApiError, type ApiClient, type RealtimeConfig } from '@/transport/ApiClient';
import { RealtimeClient } from '@/transport/RealtimeClient';
import { FakeEcho } from '@/transport/__tests__/fakeEcho';
import { DisplayRuntime } from '../DisplayRuntime';
import { DisplaySession, type DisplaySessionSink } from '../DisplaySession';
import { SnapshotPublisher } from '../SnapshotPublisher';

const T0 = 1_794_660_000_000;
const realtime: RealtimeConfig = { key: 'k', host: 'h', port: 8080, scheme: 'http', heartbeatMode: 'whisper', staleMs: 10_000 };
const fixtures = import.meta.glob<{ default: Record<string, unknown> }>('../../contracts/fixtures/*.json', { eager: true });
const fixture = (n: string) => structuredClone(fixtures[`../../contracts/fixtures/${n}.json`]!.default);

function fakeApi(over: Partial<Record<keyof ApiClient, unknown>> = {}) {
    let n = 0;
    const api = {
        createSession: vi.fn(async () => ({
            session: { id: `S${++n}`, displayName: 'TV', status: 'active' },
            device: { id: `D${n}`, role: 'display' },
            token: `tok${n}`,
            pairing: { code: 'ABC234', token: 't'.repeat(43), expiresAt: T0 + 600_000, url: 'https://x/pair#t=ttt' },
            realtime,
            serverTime: T0,
        })),
        getSession: vi.fn(async (sid: string) => ({ session: { id: sid, displayName: 'TV', status: 'active' }, device: { id: 'D', role: 'display' }, controller: null, pairing: null, realtime, serverTime: T0 })),
        regeneratePairing: vi.fn(async () => ({ pairing: { code: 'NEW234', token: 'n'.repeat(43), expiresAt: T0 + 600_000, url: 'https://x/pair#t=nnn' } })),
        revokeController: vi.fn(async () => undefined),
        postSnapshot: vi.fn(async () => ({ accepted: true, stored: true })),
        heartbeat: vi.fn(async () => undefined),
        ...over,
    };
    return api as typeof api & ApiClient;
}

async function setup(opts: { api?: ReturnType<typeof fakeApi>; online?: boolean; stored?: boolean } = {}) {
    const db = await openStageCueDb();
    const devices = new DeviceRepo(db, 'display');
    if (opts.stored) await devices.set({ role: 'display', deviceId: 'D0', sessionId: 'S0', token: 'tok0', name: 'TV' });
    const api = opts.api ?? fakeApi();
    const clock = new FakeClock(T0);
    const ref: { session?: DisplaySession } = {};
    const publisher: SnapshotPublisher = new SnapshotPublisher({ build: () => runtime.snapshot(), post: (b) => api.postSnapshot(ref.session!.sessionId!, b), enabled: () => !!ref.session?.isReady, setInterval: () => 0, clearInterval: () => {} });
    const publish = vi.spyOn(publisher, 'publishNow');
    const runtime: DisplayRuntime = new DisplayRuntime({
        clock,
        repo: new PresentationRepo(db),
        processed: new ProcessedCommandRepo(db),
        publisher,
        scheduler: { setTimeout: () => 0, clearTimeout: () => {}, requestAnimationFrame: null, document: null },
        sessionId: () => ref.session?.sessionId ?? null,
    });
    await runtime.boot();
    const echo = new FakeEcho();
    const sink: DisplaySessionSink = { onPhase: vi.fn(), onSession: vi.fn(), onPairing: vi.fn(), onController: vi.fn(), onConnection: vi.fn(), onSocket: vi.fn() };
    const timers: Array<{ fn: () => void; ms: number }> = [];
    const session = (ref.session = new DisplaySession({
        runtime,
        publisher,
        api,
        devices,
        meta: new MetaRepo(db),
        makeRealtime: (config, token) => new RealtimeClient({ config, token, echoFactory: () => echo }),
        sink,
        online: () => opts.online ?? true,
        wallNow: () => T0,
        monoNow: () => 0,
        setTimeout: (fn, ms) => (timers.push({ fn, ms }), timers.length),
        clearTimeout: () => {},
        setInterval: () => 0,
        clearInterval: () => {},
    }));
    return { session, api, sink, echo, runtime, devices, publish, timers };
}

describe('DisplaySession', () => {
    it('creates a session, stores the credentials, shows the pairing and subscribes', async () => {
        const { session, api, sink, echo, devices, publish } = await setup();
        await session.start();
        expect(api.createSession).toHaveBeenCalledTimes(1);
        expect(await devices.get()).toMatchObject({ role: 'display', sessionId: 'S1', token: 'tok1', deviceId: 'D1' });
        expect(sink.onPairing).toHaveBeenLastCalledWith({ code: 'ABC234', url: 'https://x/pair#t=ttt', expiresAt: T0 + 600_000 });
        expect(sink.onPhase).toHaveBeenLastCalledWith('ready');
        expect([...echo.channels.keys()]).toEqual(['private-session.S1.display', 'presence-session.S1']);
        echo.channels.get('private-session.S1.display')!.fireSubscribed();
        expect(publish).toHaveBeenCalled();
        session.stop();
    });

    it('resumes a stored session; a fresh code is fetched when nobody is paired', async () => {
        const { session, api, sink } = await setup({ stored: true });
        await session.start();
        expect(api.getSession).toHaveBeenCalledWith('S0');
        expect(api.createSession).not.toHaveBeenCalled();
        expect(api.regeneratePairing).toHaveBeenCalledWith('S0');
        expect(sink.onPairing).toHaveBeenLastCalledWith(expect.objectContaining({ code: 'NEW234' }));
        session.stop();
    });

    it('resumes with a paired controller without regenerating', async () => {
        const api = fakeApi({ getSession: vi.fn(async () => ({ session: { id: 'S0', displayName: 'TV', status: 'active' }, device: { id: 'D0', role: 'display' }, controller: { id: 'C', name: 'Phone', pairedAt: T0 }, pairing: null, realtime, serverTime: T0 })) });
        const { session, sink } = await setup({ api, stored: true });
        await session.start();
        expect(sink.onController).toHaveBeenLastCalledWith({ id: 'C', name: 'Phone' });
        expect(api.regeneratePairing).not.toHaveBeenCalled();
        session.stop();
    });

    it('a 401/410 on resume creates a new session and keeps the local presentation', async () => {
        const api = fakeApi({ getSession: vi.fn(async () => { throw new ApiError(410, 'SESSION_ENDED', 'x', false); }) });
        const { session, runtime, devices } = await setup({ api, stored: true });
        await runtime.local('TIMER_SET', { durationMs: 60_000 });
        const before = runtime.state;
        await session.start();
        expect(api.createSession).toHaveBeenCalledTimes(1);
        expect((await devices.get())?.sessionId).toBe('S1');
        expect(runtime.state).toBe(before);
        session.stop();
    });

    it('routes commands to the runtime and tracks the controller', async () => {
        const { session, api, sink, echo, runtime } = await setup();
        await session.start();
        const ch = echo.channels.get('private-session.S1.display')!;
        ch.emit('.command', { ...fixture('command.BLACKOUT_ON'), sessionId: 'S1' });
        await runtime.idle();
        expect(runtime.state.display.blackout).toBe(true);

        ch.emit('.controller.paired', fixture('event.controller-paired'));
        expect(sink.onController).toHaveBeenLastCalledWith({ id: '01JD3R0000000000000000CTR1', name: "Dave's iPhone" });
        expect(api.regeneratePairing).toHaveBeenCalledTimes(1);
        ch.emit('.controller.revoked', fixture('event.controller-revoked'));
        expect(sink.onController).toHaveBeenLastCalledWith(null);
        expect(api.regeneratePairing).toHaveBeenCalledTimes(2);
        session.stop();
    });

    it('session.ended starts a new session', async () => {
        const { session, api, echo } = await setup();
        await session.start();
        echo.channels.get('private-session.S1.display')!.emit('.session.ended', fixture('event.session-ended'));
        await vi.waitFor(() => expect(api.createSession).toHaveBeenCalledTimes(2));
        session.stop();
    });

    it('stays local-only while offline, and retries with back-off on failure', async () => {
        const off = await setup({ online: false });
        await off.session.start();
        expect(off.sink.onPhase).toHaveBeenLastCalledWith('offline');
        expect(off.api.createSession).not.toHaveBeenCalled();

        const api = fakeApi({ createSession: vi.fn(async () => { throw new ApiError(0, 'NETWORK', 'down', true); }) });
        const failing = await setup({ api });
        await failing.session.start();
        expect(failing.sink.onPhase).toHaveBeenLastCalledWith('error', 'down');
        expect(failing.timers.at(-1)?.ms).toBeGreaterThanOrEqual(800);
        failing.session.stop();
    });

    it('revokes the controller and shows a new code', async () => {
        const { session, api, sink } = await setup();
        await session.start();
        await session.revokeController();
        expect(api.revokeController).toHaveBeenCalledWith('S1');
        expect(sink.onController).toHaveBeenLastCalledWith(null);
        expect(sink.onPairing).toHaveBeenLastCalledWith(expect.objectContaining({ code: 'NEW234' }));
        session.stop();
    });

    it('auto-regenerates an expired code while nobody is paired', async () => {
        const { session, api, timers } = await setup();
        await session.start();
        const expiry = timers.find((t) => t.ms === 600_000)!;
        expiry.fn();
        await vi.waitFor(() => expect(api.regeneratePairing).toHaveBeenCalledTimes(1));
        session.stop();
    });
});

describe('DisplaySession without the live channel (A22)', () => {
    it('picks up a pair and an unpair over HTTP, no reload needed', async () => {
        let controller: { id: string; name: string; pairedAt: number } | null = null;
        const getSession = vi.fn(async (sid: string) => ({ session: { id: sid, displayName: 'TV', status: 'active' }, device: { id: 'D', role: 'display' }, controller, pairing: { code: 'ABC234', expiresAt: T0 + 600_000 }, realtime, serverTime: T0 }));
        const intervals: Array<() => void> = [];
        const ctx = await setup({ api: fakeApi({ getSession }) });
        (ctx.session as unknown as { deps: { setInterval: (fn: () => void) => number } }).deps.setInterval = (fn: () => void) => (intervals.push(fn), intervals.length);
        await ctx.session.start(); // the fake socket stays "connecting" — never connected
        controller = { id: 'C9', name: 'Phone', pairedAt: T0 };
        intervals.forEach((fn) => fn());
        await vi.waitFor(() => expect(ctx.sink.onController).toHaveBeenLastCalledWith({ id: 'C9', name: 'Phone' }));
        controller = null;
        intervals.forEach((fn) => fn());
        await vi.waitFor(() => expect(ctx.sink.onController).toHaveBeenLastCalledWith(null));
        ctx.session.stop();
    });
});
