import { describe, expect, it, vi } from 'vitest';
import { Heartbeat, HEARTBEAT } from '../Heartbeat';
import { ConnectionStateMachine, computeConnection } from '../ConnectionStateMachine';

function setup(mode: 'whisper' | 'http' = 'whisper') {
    let mono = 0;
    const whisper = vi.fn(() => true);
    const postHeartbeat = vi.fn(async () => undefined);
    const onPeer = vi.fn();
    let tick: (() => void) | null = null;
    const hb = new Heartbeat({
        mode,
        sessionId: 'S',
        role: 'display',
        deviceId: 'D',
        current: () => ({ revision: 4, presentationId: 'P' }),
        whisper,
        postHeartbeat,
        onPeer,
        monoNow: () => mono,
        wallNow: () => 1000 + mono,
        setInterval: (fn) => ((tick = fn), 1),
        clearInterval: () => (tick = null),
    });
    return { hb, whisper, postHeartbeat, onPeer, advance: (ms: number) => (mono += ms), tick: () => tick?.() };
}

describe('Heartbeat', () => {
    it('whispers immediately and on every interval', () => {
        const { hb, whisper, tick } = setup();
        expect(hb.intervalMs).toBe(3_000);
        expect(hb.lostAfterMs).toBe(9_000);
        hb.start();
        hb.start();
        tick();
        expect(whisper).toHaveBeenCalledTimes(2);
        expect(whisper).toHaveBeenCalledWith('S', { v: 1, role: 'display', deviceId: 'D', presentationId: 'P', revision: 4, sentAt: 1000 });
        hb.stop();
        tick();
        expect(whisper).toHaveBeenCalledTimes(2);
    });

    it('posts in HTTP fallback mode', () => {
        const { hb, postHeartbeat, whisper } = setup('http');
        expect(hb.intervalMs).toBe(HEARTBEAT.http.intervalMs);
        hb.start();
        expect(postHeartbeat).toHaveBeenCalledWith('S', { revision: 4, presentationId: 'P' });
        expect(whisper).not.toHaveBeenCalled();
    });

    it('WS-04 tracks the peer age and ignores its own role', () => {
        const { hb, onPeer, advance } = setup();
        expect(hb.peerAgeMs()).toBe(Infinity);
        hb.receive({ role: 'display', revision: 1, sentAt: 0 });
        expect(hb.peerAgeMs()).toBe(Infinity);
        hb.receive({ role: 'controller', revision: null, sentAt: 0 });
        expect(onPeer).toHaveBeenCalledTimes(1);
        advance(9_500);
        expect(hb.peerAgeMs()).toBe(9_500);
        hb.seen();
        expect(hb.peerAgeMs()).toBe(0);
    });
});

describe('ConnectionStateMachine', () => {
    const base = { online: true, socket: 'connected' as const, peerAgeMs: 1_000, syncPending: false, lostAfterMs: 9_000 };

    it('computes the state table', () => {
        expect(computeConnection(base)).toEqual({ server: 'online', peer: 'connected' });
        expect(computeConnection({ ...base, syncPending: true })).toEqual({ server: 'online', peer: 'synchronizing' });
        expect(computeConnection({ ...base, peerAgeMs: 9_000 }).peer).toBe('connected');
        expect(computeConnection({ ...base, peerAgeMs: 9_001 }).peer).toBe('reconnecting');
        expect(computeConnection({ ...base, peerAgeMs: 30_000 }).peer).toBe('reconnecting');
        expect(computeConnection({ ...base, peerAgeMs: 30_001 }).peer).toBe('disconnected');
        expect(computeConnection({ ...base, socket: 'unavailable', peerAgeMs: 5_000 })).toEqual({ server: 'offline', peer: 'reconnecting' });
        expect(computeConnection({ ...base, socket: 'connecting', peerAgeMs: Infinity })).toEqual({ server: 'offline', peer: 'disconnected' });
        expect(computeConnection({ ...base, online: false })).toEqual({ server: 'offline', peer: 'reconnecting' });
        expect(computeConnection({ ...base, lostAfterMs: 15_000, peerAgeMs: 14_000 }).peer).toBe('connected');
    });

    it('WS-04 reports reconnecting at 9 s and disconnected at 30 s as time passes', () => {
        let age = 0;
        let tick: (() => void) | null = null;
        const onChange = vi.fn();
        const sm = new ConnectionStateMachine({ peerAgeMs: () => age, lostAfterMs: 9_000, online: () => true, onChange, setInterval: (fn) => ((tick = fn), 1), clearInterval: () => (tick = null) });
        sm.setSocket('connected');
        sm.start();
        expect(sm.status).toEqual({ server: 'online', peer: 'connected' });
        age = 9_500;
        tick!();
        expect(onChange).toHaveBeenLastCalledWith({ server: 'online', peer: 'reconnecting' });
        age = 31_000;
        tick!();
        expect(onChange).toHaveBeenLastCalledWith({ server: 'online', peer: 'disconnected' });
        sm.setSyncPending(true);
        expect(onChange).toHaveBeenLastCalledWith({ server: 'online', peer: 'synchronizing' });
        const calls = onChange.mock.calls.length;
        tick!();
        expect(onChange.mock.calls.length).toBe(calls); // only changes are reported
        sm.stop();
        expect(tick).toBeNull();
    });
});

describe('Heartbeat while offline', () => {
    it('sends nothing while the device reports offline', () => {
        let online = false;
        const whisper = vi.fn(() => true);
        const hb = new Heartbeat({ mode: 'whisper', sessionId: 'S', role: 'controller', deviceId: 'C', current: () => ({ revision: 1, presentationId: 'P' }), whisper, postHeartbeat: async () => {}, online: () => online, setInterval: () => 1, clearInterval: () => {} });
        hb.beat();
        expect(whisper).not.toHaveBeenCalled();
        online = true;
        hb.beat();
        expect(whisper).toHaveBeenCalledTimes(1);
    });
});
