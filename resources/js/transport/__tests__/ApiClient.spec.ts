import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError, backoffDelay, withRetry } from '../ApiClient';
import { ServerClock } from '../ServerClock';

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
    return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

describe('ApiClient', () => {
    it('sends JSON with the bearer token and parses the response', async () => {
        const fetch = vi.fn(async () => respond(202, { commandId: 'c', seq: 1, relayedAt: 5, status: 'relayed' }));
        const api = new ApiClient({ fetch, token: () => 'tok', baseUrl: 'https://x.test' });
        const r = await api.sendCommand('S1', { v: 1, commandId: 'c', name: 'TIMER_START', baseRevision: 1, issuedAt: 1, payload: {} });
        expect(r.seq).toBe(1);
        const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe('https://x.test/api/sessions/S1/commands');
        expect(init.method).toBe('POST');
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
        expect(JSON.parse(init.body as string)).toMatchObject({ name: 'TIMER_START', payload: {} });
    });

    it('does not send the token to public endpoints', async () => {
        const fetch = vi.fn(async () => respond(201, { token: 't' }));
        await new ApiClient({ fetch, token: () => 'tok' }).pair({ code: 'ABC234' }, 'Phone');
        const init = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1];
        expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    });

    it('A24: sends the account token, not the device token, when opening a session or pairing', async () => {
        const fetch = vi.fn(async () => respond(201, { token: 't' }));
        const api = new ApiClient({ fetch, token: () => 'device-tok' });
        await api.pair({ code: 'ABC234' }, 'Phone', 'acct-tok');
        await api.createSession('TV', 'acct-tok');
        for (const call of fetch.mock.calls as unknown as Array<[string, RequestInit]>) {
            expect((call[1].headers as Record<string, string>).Authorization).toBe('Bearer acct-tok');
        }
    });

    it('maps the error shape to a typed ApiError', async () => {
        const api = new ApiClient({ fetch: async () => respond(410, { error: { code: 'PAIRING_EXPIRED', message: 'expired', retryable: false } }) });
        const e = await api.pair({ code: 'ABC234' }, 'p').catch((x) => x);
        expect(e).toBeInstanceOf(ApiError);
        expect(e).toMatchObject({ status: 410, code: 'PAIRING_EXPIRED', retryable: false, isAuthLoss: true });
        const e503 = await new ApiClient({ fetch: async () => respond(503, { error: { code: 'RELAY_UNAVAILABLE', message: 'x', retryable: true } }) }).time().catch((x) => x);
        expect(e503).toMatchObject({ code: 'RELAY_UNAVAILABLE', retryable: true, isAuthLoss: false });
        const ugly = await new ApiClient({ fetch: async () => new Response('<html>', { status: 502 }) }).time().catch((x) => x);
        expect(ugly).toMatchObject({ status: 502, code: 'HTTP_502', retryable: true });
    });

    it('maps network failures and timeouts to retryable errors', async () => {
        const net = await new ApiClient({ fetch: async () => { throw new TypeError('Failed to fetch'); } }).time().catch((x) => x);
        expect(net).toMatchObject({ code: 'NETWORK', retryable: true, status: 0 });
        const slow = new ApiClient({
            timeoutMs: 10,
            fetch: (_u, init) => new Promise((_r, reject) => init!.signal!.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))),
        });
        expect(await slow.time().catch((x) => x)).toMatchObject({ code: 'TIMEOUT', retryable: true });
    });

    it('returns undefined for 204 and feeds X-Server-Time to the ServerClock', async () => {
        let wall = 1_000;
        const clock = new ServerClock(() => wall);
        const api = new ApiClient({
            serverClock: clock,
            wallNow: () => wall,
            fetch: async () => {
                wall += 100; // 100 ms round trip
                return new Response(null, { status: 204, headers: { 'X-Server-Time': '5050' } });
            },
        });
        expect(await api.revokeController('S')).toBeUndefined();
        expect(clock.offset).toBe(4_000); // 5050 − (1000 + 50)
    });
});

describe('ServerClock', () => {
    it('keeps the smallest-RTT sample of the last five', () => {
        const onChange = vi.fn();
        const clock = new ServerClock(() => 10_000, null, onChange);
        expect(clock.now()).toBeNull();
        clock.sample(0, 400, 1_000); // rtt 400 → offset 800
        clock.sample(0, 100, 1_000); // rtt 100 → offset 950 (best)
        clock.sample(0, 300, 2_000);
        expect(clock.offset).toBe(950);
        expect(clock.now()).toBe(10_950);
        for (let i = 0; i < 5; i++) clock.sample(0, 200, 3_000); // the rtt-100 sample falls out of the window
        expect(clock.offset).toBe(2_900);
        expect(onChange).toHaveBeenCalled();
        clock.sample(5, 1, 1); // nonsense is ignored
        expect(clock.offset).toBe(2_900);
    });

    it('starts from a persisted sample', () => {
        expect(new ServerClock(() => 0, { offsetMs: 7, rttMs: 1 }).now()).toBe(7);
    });
});

describe('retry', () => {
    it('backs off 1, 2, 4, 8, 15 s with ±20% jitter', () => {
        expect([0, 1, 2, 3, 4, 5].map((a) => backoffDelay(a, () => 0.5))).toEqual([1000, 2000, 4000, 8000, 15000, 15000]);
        expect(backoffDelay(0, () => 0)).toBe(800);
        expect(backoffDelay(0, () => 1)).toBe(1200);
    });

    it('retries only retryable errors', async () => {
        const sleep = vi.fn(async () => {});
        let n = 0;
        const result = await withRetry(async () => {
            if (n++ < 2) throw new ApiError(503, 'RELAY_UNAVAILABLE', 'x', true);
            return 'ok';
        }, { sleep });
        expect(result).toBe('ok');
        expect(sleep).toHaveBeenCalledTimes(2);
        const fatal = withRetry(async () => { throw new ApiError(422, 'VALIDATION_FAILED', 'x', false); }, { sleep });
        await expect(fatal).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
        const exhausted = withRetry(async () => { throw new ApiError(0, 'NETWORK', 'x', true); }, { sleep, retries: 1 });
        await expect(exhausted).rejects.toMatchObject({ code: 'NETWORK' });
    });
});
