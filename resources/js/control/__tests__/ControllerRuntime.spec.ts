import { describe, expect, it, vi } from 'vitest';
import { openStageCueDb } from '@/storage/db';
import { DeviceRepo } from '@/storage/DeviceRepo';
import { MetaRepo } from '@/storage/MetaRepo';
import { ApiError, type ApiClient, type RealtimeConfig } from '@/transport/ApiClient';
import { RealtimeClient } from '@/transport/RealtimeClient';
import { FakeEcho } from '@/transport/__tests__/fakeEcho';
import type { CommandRequest, StateEvent } from '@/core/types';
import { ControllerRuntime, type ControllerSink } from '../ControllerRuntime';

const realtime: RealtimeConfig = { key: 'k', host: 'h', port: 8080, scheme: 'http', heartbeatMode: 'whisper', staleMs: 10_000 };
const fixtures = import.meta.glob<{ default: Record<string, unknown> }>('../../contracts/fixtures/*.json', { eager: true });
const fixture = <T = Record<string, unknown>>(n: string): T => structuredClone(fixtures[`../../contracts/fixtures/${n}.json`]!.default) as T;
const stateEvent = (revision: number, over: Partial<StateEvent> = {}): StateEvent => {
    const e = fixture<StateEvent>('event.state');
    return { ...e, revision, state: { ...e.state, revision }, acks: [], ...over };
};

async function setup(api: Partial<Record<keyof ApiClient, unknown>> = {}) {
    const db = await openStageCueDb();
    const devices = new DeviceRepo(db, 'controller');
    await devices.set({ role: 'controller', deviceId: 'C1', sessionId: 'S1', token: 'tok', name: 'Phone', sessionName: 'TV' });
    const sent: CommandRequest[] = [];
    const fake = {
        getSession: vi.fn(async () => ({ session: { id: 'S1', displayName: 'Main Hall TV', status: 'active' }, device: { id: 'C1', role: 'controller' }, controller: null, pairing: null, realtime, serverTime: 0 })),
        getState: vi.fn(async () => ({ snapshot: null, storedAt: null })),
        sendCommand: vi.fn(async (_sid: string, r: CommandRequest) => (sent.push(r), { commandId: r.commandId, seq: sent.length, relayedAt: 0, status: 'relayed' as const })),
        leave: vi.fn(async () => undefined),
        heartbeat: vi.fn(async () => undefined),
        ...api,
    } as unknown as ApiClient;
    const echo = new FakeEcho();
    let mono = 1_000;
    const timeouts: Array<{ fn: () => void; ms: number }> = [];
    const sink: ControllerSink = { onMirror: vi.fn(), onOutbox: vi.fn(), onConnection: vi.fn(), onSession: vi.fn(), onUnpaired: vi.fn(), onSocket: vi.fn(), onConflict: vi.fn(), onReachable: vi.fn() };
    const rt = new ControllerRuntime({
        api: fake,
        devices,
        meta: new MetaRepo(db),
        makeRealtime: (config, token) => new RealtimeClient({ config, token, echoFactory: () => echo }),
        sink,
        online: () => true,
        monoNow: () => mono,
        wallNow: () => 1_794_660_000_000,
        setTimeout: (fn, ms) => (timeouts.push({ fn, ms }), timeouts.length),
        clearTimeout: () => {},
        setInterval: () => 0,
        clearInterval: () => {},
    });
    const channel = () => echo.channels.get('private-session.S1.controllers')!;
    const presence = () => echo.channels.get('presence-session.S1')!;
    return { rt, api: fake, echo, sink, sent, devices, channel, presence, timeouts, advance: (ms: number) => (mono += ms) };
}

describe('ControllerRuntime', () => {
    it('reports unpaired when there are no credentials', async () => {
        const db = await openStageCueDb();
        const sink = { onMirror: vi.fn(), onOutbox: vi.fn(), onConnection: vi.fn(), onSession: vi.fn(), onUnpaired: vi.fn() };
        const rt = new ControllerRuntime({ api: {} as ApiClient, devices: new DeviceRepo(db, 'controller'), makeRealtime: () => ({}) as never, sink });
        await rt.start();
        expect(sink.onUnpaired).toHaveBeenCalledWith('none');
    });

    it('WS-05 sync handshake: paint the cached snapshot as last-known, then SYNC_REQUEST until the ack', async () => {
        const cached = stateEvent(40);
        const { rt, api, sink, sent, channel, echo } = await setup({ getState: vi.fn(async () => ({ snapshot: cached, storedAt: 1 })) });
        await rt.start();
        expect(sink.onSession).toHaveBeenLastCalledWith({ sessionName: 'Main Hall TV', deviceName: 'Phone' });
        echo.setState('connected');
        channel().fireSubscribed();
        await vi.waitFor(() => expect(sent.map((r) => r.name)).toEqual(['SYNC_REQUEST']));
        expect(api.getState).toHaveBeenCalledWith('S1');
        expect(rt.mirror).toMatchObject({ live: false, state: { revision: 40 } });
        expect(rt.connection.peer).toBe('synchronizing');

        channel().emit('.state', stateEvent(41, { acks: [{ commandId: sent[0]!.commandId, result: 'APPLIED' }] }));
        expect(rt.mirror).toMatchObject({ live: true, state: { revision: 41 } });
        expect(rt.connection.peer).not.toBe('synchronizing');
    });

    it('accepts newer revisions and new epochs, ignores regressions, refreshes timing on equal revisions', async () => {
        const { rt, channel } = await setup();
        await rt.start();
        channel().emit('.state', stateEvent(10));
        channel().emit('.state', stateEvent(9));
        expect(rt.mirror?.state.revision).toBe(10);
        const before = rt.mirror!.receivedAtMono;
        channel().emit('.state', { ...stateEvent(10), capturedAtWall: stateEvent(10).capturedAtWall + 5 });
        expect(rt.mirror!.capturedAtWall).toBe(stateEvent(10).capturedAtWall + 5);
        expect(rt.mirror!.receivedAtMono).toBe(before);
        const e = stateEvent(0, { presentationId: '01JD3T0000000000000000PRES' });
        channel().emit('.state', { ...e, state: { ...e.state, presentationId: '01JD3T0000000000000000PRES' } });
        expect(rt.mirror?.state.revision).toBe(0);
    });

    it('sends intent commands with the mirror revision; acks confirm them', async () => {
        const { rt, sent, channel } = await setup();
        await rt.start();
        expect(await rt.send('TIMER_SET', { durationMs: 60_000 })).toBe('rejected'); // destructive without a mirror
        channel().emit('.state', stateEvent(42));
        const done = rt.send('TIMER_START', {});
        await vi.waitFor(() => expect(sent).toHaveLength(1));
        expect(sent[0]).toMatchObject({ name: 'TIMER_START', baseRevision: 42, v: 1 });
        channel().emit('.state', stateEvent(43, { acks: [{ commandId: sent[0]!.commandId, result: 'APPLIED' }] }));
        expect(await done).toBe('confirmed');
    });

    it('rule 5: a socket drop turns awaiting commands into unconfirmed', async () => {
        const { rt, echo, channel } = await setup();
        await rt.start();
        echo.setState('connected');
        channel().emit('.state', stateEvent(1));
        const done = rt.send('BLACKOUT_ON', {});
        await vi.waitFor(() => expect(rt.outbox.list()[0]?.status).toBe('awaiting'));
        echo.setState('unavailable');
        expect(await done).toBe('unconfirmed');
    });

    it('gap recovery: a display heartbeat ahead of the mirror triggers SYNC_REQUEST after 1 s', async () => {
        const { rt, sent, channel, presence, timeouts } = await setup();
        await rt.start();
        channel().emit('.state', stateEvent(5));
        presence().emit('client-heartbeat', { ...fixture<Record<string, unknown>>("heartbeat"), revision: 7 });
        const gap = timeouts.find((t) => t.ms === 1_000)!;
        gap.fn();
        await vi.waitFor(() => expect(sent.map((r) => r.name)).toEqual(['SYNC_REQUEST']));
    });

    it('a revoke, an end or a 401 clears the credentials and reports why', async () => {
        const a = await setup();
        await a.rt.start();
        a.channel().emit('.controller.revoked', { v: 1, deviceId: 'C1', reason: 'revoked_by_display' });
        await vi.waitFor(() => expect(a.sink.onUnpaired).toHaveBeenCalledWith('revoked'));
        expect(await a.devices.get()).toBeNull();

        const b = await setup();
        await b.rt.start();
        b.channel().emit('.controller.revoked', { v: 1, deviceId: 'OTHER', reason: 'replaced' });
        b.channel().emit('.session.ended', { v: 1, endedAt: 1 });
        await vi.waitFor(() => expect(b.sink.onUnpaired).toHaveBeenCalledWith('ended'));

        const c = await setup({ getSession: vi.fn(async () => { throw new ApiError(401, 'UNAUTHENTICATED', 'x', false); }) });
        await c.rt.start();
        expect(c.sink.onUnpaired).toHaveBeenCalledWith('revoked');
    });

    it('unpair calls leave and clears the credentials', async () => {
        const { rt, api, devices, sink } = await setup();
        await rt.start();
        await rt.unpair();
        expect(api.leave).toHaveBeenCalledWith('S1');
        expect(await devices.get()).toBeNull();
        expect(sink.onUnpaired).toHaveBeenCalledWith('left');
    });

    it('starts offline from the cached realtime config', async () => {
        const { rt, echo } = await setup({ getSession: vi.fn(async () => { throw new ApiError(0, 'NETWORK', 'x', true); }) });
        await rt.start();
        expect(echo.channels.size).toBe(0); // no cached config yet in this fresh database
        rt.stop();
    });
});

describe('ControllerRuntime STALE_VIEW', () => {
    it('T8.2 refreshes the mirror, asks, and confirms with a NEW command against the new revision', async () => {
        const { rt, sink, sent, channel } = await setup();
        await rt.start();
        channel().emit('.state', stateEvent(5));
        const done = rt.send('TIMER_RESET', {});
        await vi.waitFor(() => expect(sent).toHaveLength(1));
        expect(sent[0]!.baseRevision).toBe(5);
        channel().emit('.state', stateEvent(7, { acks: [{ commandId: sent[0]!.commandId, result: 'REJECTED', code: 'STALE_VIEW', message: 'The display changed. Confirm again?' }] }));
        expect(await done).toBe('rejected');
        await vi.waitFor(() => expect(sent.map((r) => r.name)).toEqual(['TIMER_RESET', 'SYNC_REQUEST']));
        expect(sink.onConflict).toHaveBeenLastCalledWith({ name: 'TIMER_RESET', payload: {} });

        void rt.confirmConflict({ name: 'TIMER_RESET', payload: {} });
        await vi.waitFor(() => expect(sent).toHaveLength(3));
        expect(sent[2]).toMatchObject({ name: 'TIMER_RESET', baseRevision: 7 });
        expect(sent[2]!.commandId).not.toBe(sent[0]!.commandId);
        expect(sink.onConflict).toHaveBeenLastCalledWith(null);
    });
});

describe('ControllerRuntime without the live channel (A22)', () => {
    it('paints the last known state at once and keeps it fresh over HTTP', async () => {
        let snapshot: StateEvent | null = stateEvent(3);
        const intervals: Array<() => void> = [];
        const { rt, sink } = await setup({ getState: vi.fn(async () => ({ snapshot, storedAt: 1 })) });
        // capture the poll interval
        (rt as unknown as { deps: { setInterval: (fn: () => void) => number } }).deps.setInterval = (fn: () => void) => (intervals.push(fn), intervals.length);
        await rt.start();
        expect(rt.mirror).toMatchObject({ live: false, state: { revision: 3 } });
        expect(sink.onReachable).toHaveBeenLastCalledWith(true);

        snapshot = stateEvent(4);
        intervals[0]!(); // socket never connected → poll
        await vi.waitFor(() => expect(rt.mirror?.state.revision).toBe(4));
    });

    it('notices an unpair over HTTP while the live channel is down', async () => {
        let revoked = false;
        const intervals: Array<() => void> = [];
        const { rt, sink, devices } = await setup({
            getState: vi.fn(async () => {
                if (revoked) throw new ApiError(401, 'UNAUTHENTICATED', 'x', false);
                return { snapshot: null, storedAt: null };
            }),
        });
        (rt as unknown as { deps: { setInterval: (fn: () => void) => number } }).deps.setInterval = (fn: () => void) => (intervals.push(fn), intervals.length);
        await rt.start();
        revoked = true;
        intervals[0]!();
        await vi.waitFor(() => expect(sink.onUnpaired).toHaveBeenCalledWith('revoked'));
        expect(await devices.get()).toBeNull();
    });

    it('a network failure never unpairs; it retries', async () => {
        const intervals: Array<() => void> = [];
        const getSession = vi.fn(async () => {
            throw new ApiError(0, 'NETWORK', 'x', true);
        });
        const { rt, sink, devices } = await setup({ getSession, getState: vi.fn(async () => { throw new ApiError(0, 'NETWORK', 'x', true); }) });
        (rt as unknown as { deps: { setInterval: (fn: () => void) => number } }).deps.setInterval = (fn: () => void) => (intervals.push(fn), intervals.length);
        await rt.start();
        expect(sink.onReachable).toHaveBeenLastCalledWith(false);
        intervals[0]!();
        await vi.waitFor(() => expect(getSession).toHaveBeenCalledTimes(2));
        expect(sink.onUnpaired).not.toHaveBeenCalled();
        expect(await devices.get()).not.toBeNull();
    });
});

describe('ControllerRuntime sync retry', () => {
    it('asks again when the Display has not answered a SYNC_REQUEST within 3 s', async () => {
        const { rt, sent, channel, echo, timeouts } = await setup();
        await rt.start();
        echo.setState('connected');
        channel().fireSubscribed();
        await vi.waitFor(() => expect(sent.map((r) => r.name)).toEqual(['SYNC_REQUEST']));
        expect(rt.connection.peer).toBe('synchronizing');
        timeouts.filter((t) => t.ms === 3_000).at(-1)!.fn(); // no answer
        await vi.waitFor(() => expect(sent.map((r) => r.name)).toEqual(['SYNC_REQUEST', 'SYNC_REQUEST']));
        expect(sent[1]!.commandId).not.toBe(sent[0]!.commandId);
        channel().emit('.state', stateEvent(5, { acks: [{ commandId: sent[1]!.commandId, result: 'APPLIED' }] }));
        expect(rt.connection.peer).not.toBe('synchronizing');
        timeouts.filter((t) => t.ms === 3_000).at(-1)!.fn(); // the stale timer must not re-ask
        expect(sent).toHaveLength(2);
    });
});
