import { describe, expect, it, vi } from 'vitest';
import { readShellConfig, RealtimeClient } from '../RealtimeClient';
import type { RealtimeConfig } from '../ApiClient';
import { FakeEcho } from './fakeEcho';

const fixtures = import.meta.glob<{ default: Record<string, unknown> }>('../../contracts/fixtures/*.json', { eager: true });
const fixture = (n: string) => structuredClone(fixtures[`../../contracts/fixtures/${n}.json`]!.default);
const config: RealtimeConfig = { key: 'k', host: 'ws.test', port: 443, scheme: 'https', heartbeatMode: 'whisper', staleMs: 10_000 };

function setup() {
    const echo = new FakeEcho();
    const factory = vi.fn(() => echo);
    const onInvalid = vi.fn();
    const rt = new RealtimeClient({ config, token: () => 'tok', baseUrl: 'https://app.test', echoFactory: factory, onInvalid });
    return { echo, factory, onInvalid, rt };
}

describe('RealtimeClient', () => {
    it('creates Echo lazily with the bearer token and auth endpoint', () => {
        const { rt, factory } = setup();
        expect(factory).not.toHaveBeenCalled();
        rt.connect();
        rt.connect();
        expect(factory).toHaveBeenCalledTimes(1);
        expect(factory).toHaveBeenCalledWith({ config, token: 'tok', authEndpoint: 'https://app.test/api/broadcasting/auth' });
    });

    it('tracks the socket state', () => {
        const { rt, echo } = setup();
        const seen: string[] = [];
        rt.onConnectionState((s) => seen.push(s));
        rt.connect();
        echo.setState('connected');
        echo.setState('unavailable');
        expect(seen).toEqual(['initialized', 'connecting', 'connected', 'unavailable']);
        rt.reconnect();
        expect(echo.connects).toBe(1);
        echo.setState('connected');
        rt.reconnect();
        expect(echo.connects).toBe(1);
    });

    it('WS-01 subscribes the display channel and delivers valid events only', () => {
        const { rt, echo, onInvalid } = setup();
        const h = { command: vi.fn(), controllerPaired: vi.fn(), controllerRevoked: vi.fn(), sessionEnded: vi.fn(), peerHeartbeat: vi.fn(), subscribed: vi.fn(), error: vi.fn() };
        const leave = rt.subscribeDisplay('S1', h);
        const ch = echo.channels.get('private-session.S1.display')!;
        ch.fireSubscribed();
        ch.emit('.command', fixture('command.TIMER_SET'));
        ch.emit('.command', { ...fixture('command.TIMER_SET'), payload: { durationMs: 5 } }); // bad payload → delivered, the reducer acks INVALID_PAYLOAD
        ch.emit('.command', { ...fixture('command.TIMER_SET'), seq: 'x' }); // bad envelope → dropped
        ch.emit('.controller.paired', fixture('event.controller-paired'));
        ch.emit('.controller.revoked', fixture('event.controller-revoked'));
        ch.emit('.session.ended', fixture('event.session-ended'));
        ch.emit('.peer.heartbeat', fixture('event.peer-heartbeat'));
        for (const cb of ch.errorCbs) cb({ status: 403 });

        expect(h.subscribed).toHaveBeenCalledTimes(1);
        expect(h.command).toHaveBeenCalledTimes(2);
        expect(h.command.mock.calls[0]![0]).toMatchObject({ name: 'TIMER_SET', seq: 57 });
        expect(onInvalid).toHaveBeenCalledWith('.command', expect.anything());
        for (const fn of [h.controllerPaired, h.controllerRevoked, h.sessionEnded, h.peerHeartbeat, h.error]) expect(fn).toHaveBeenCalledTimes(1);
        leave();
        expect(echo.left).toEqual(['session.S1.display']);
    });

    it('subscribes the controllers channel for state events', () => {
        const { rt, echo } = setup();
        const state = vi.fn();
        rt.subscribeControllers('S1', { state });
        const ch = echo.channels.get('private-session.S1.controllers')!;
        ch.emit('.state', fixture('event.state'));
        ch.emit('.state', { nope: true });
        expect(state).toHaveBeenCalledTimes(1);
        expect(state.mock.calls[0]![0]).toMatchObject({ type: 'state', revision: 42 });
    });

    it('joins presence, receives validated whispers and whispers only when connected', () => {
        const { rt, echo } = setup();
        const h = { here: vi.fn(), joining: vi.fn(), leaving: vi.fn(), heartbeat: vi.fn() };
        const leave = rt.joinPresence('S1', h);
        const ch = echo.channels.get('presence-session.S1')!;
        ch.hereCb!([{ id: 'd', role: 'display', name: 'TV' }]);
        ch.joiningCb!({ id: 'c', role: 'controller', name: 'Phone' });
        ch.leavingCb!({ id: 'c', role: 'controller', name: 'Phone' });
        ch.emit('client-heartbeat', fixture('heartbeat'));
        ch.emit('client-heartbeat', { role: 'hacker' });
        expect(h.here).toHaveBeenCalledWith([{ id: 'd', role: 'display', name: 'TV' }]);
        expect(h.joining).toHaveBeenCalledTimes(1);
        expect(h.leaving).toHaveBeenCalledTimes(1);
        expect(h.heartbeat).toHaveBeenCalledTimes(1);

        const hb = fixture('heartbeat') as never;
        expect(rt.whisper('S1', hb)).toBe(false); // not connected yet
        echo.setState('connected');
        expect(rt.whisper('S1', hb)).toBe(true);
        expect(ch.whispers).toEqual([{ event: 'heartbeat', data: hb }]);
        expect(rt.whisper('OTHER', hb)).toBe(false);
        leave();
        expect(rt.whisper('S1', hb)).toBe(false);
    });

    it('disconnects', () => {
        const { rt, echo } = setup();
        rt.connect();
        rt.disconnect();
        expect(echo.disconnected).toBe(true);
        expect(rt.connectionState).toBe('disconnected');
    });
});

describe('readShellConfig', () => {
    it('reads the runtime config script tag', () => {
        document.body.innerHTML = `<script id="stagecue-config" type="application/json">{"reverb":{"key":"k","host":"h","port":8080,"scheme":"http"},"heartbeatMode":"http","staleMs":9000}</script>`;
        expect(readShellConfig()).toEqual({ key: 'k', host: 'h', port: 8080, scheme: 'http', heartbeatMode: 'http', staleMs: 9000 });
        document.body.innerHTML = `<script id="stagecue-config" type="application/json">{"reverb":{"key":null}}</script>`;
        expect(readShellConfig()).toBeNull();
        document.body.innerHTML = `<script id="stagecue-config" type="application/json">not json</script>`;
        expect(readShellConfig()).toBeNull();
        document.body.innerHTML = '';
        expect(readShellConfig()).toBeNull();
    });
});
