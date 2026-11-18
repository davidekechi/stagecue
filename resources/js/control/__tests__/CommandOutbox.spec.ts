import { describe, expect, it, vi } from 'vitest';
import { makeCommand } from '@/core/commands';
import type { CommandRequest } from '@/core/types';
import { ApiError, type CommandResponse } from '@/transport/ApiClient';
import { ACK_TIMEOUT_MS, CommandOutbox, type PendingCommand } from '../CommandOutbox';

function setup(post: (r: CommandRequest) => Promise<CommandResponse> = async (r) => ({ commandId: r.commandId, seq: 1, relayedAt: 0, status: 'relayed' })) {
    const timers: Array<{ fn: () => void; ms: number; live: boolean }> = [];
    const changes: PendingCommand[][] = [];
    const onAuthLoss = vi.fn();
    const outbox = new CommandOutbox({
        post: vi.fn(post),
        onChange: (e) => changes.push(e),
        onAuthLoss,
        setTimeout: (fn, ms) => (timers.push({ fn, ms, live: true }), timers.length - 1),
        clearTimeout: (h) => (timers[h as number]!.live = false),
    });
    const fire = (ms: number) => timers.filter((t) => t.live && t.ms === ms).forEach((t) => ((t.live = false), t.fn()));
    return { outbox, changes, fire, onAuthLoss };
}
const req = () => makeCommand('TIMER_START', {}, 3) as CommandRequest;

describe('CommandOutbox', () => {
    it('sending → awaiting → confirmed on the ack, then fades out', async () => {
        const { outbox, fire } = setup();
        const r = req();
        const done = outbox.submit(r);
        expect(outbox.get(r.commandId)?.status).toBe('sending');
        await vi.waitFor(() => expect(outbox.get(r.commandId)?.status).toBe('awaiting'));
        outbox.ack({ commandId: r.commandId, result: 'APPLIED' });
        expect(await done).toBe('confirmed');
        fire(800);
        expect(outbox.get(r.commandId)).toBeUndefined();
    });

    it('rejected with the reason', async () => {
        const { outbox } = setup();
        const r = req();
        const done = outbox.submit(r);
        await vi.waitFor(() => expect(outbox.get(r.commandId)?.status).toBe('awaiting'));
        outbox.ack({ commandId: r.commandId, result: 'REJECTED', code: 'INVALID_STATE', message: 'Not now' });
        expect(await done).toBe('rejected');
        expect(outbox.get(r.commandId)).toMatchObject({ code: 'INVALID_STATE', message: 'Not now' });
    });

    it('unconfirmed after 3 s; retry keeps the commandId; DUPLICATE confirms', async () => {
        const { outbox, fire } = setup();
        const r = req();
        const first = outbox.submit(r);
        await vi.waitFor(() => expect(outbox.get(r.commandId)?.status).toBe('awaiting'));
        fire(ACK_TIMEOUT_MS);
        expect(await first).toBe('unconfirmed');
        const again = outbox.retry(r.commandId);
        await vi.waitFor(() => expect(outbox.get(r.commandId)?.status).toBe('awaiting'));
        outbox.ack({ commandId: r.commandId, result: 'DUPLICATE' });
        expect(await again).toBe('confirmed');
    });

    it('a duplicate POST that was already applied or rejected settles at once', async () => {
        const applied = setup(async (r) => ({ commandId: r.commandId, seq: 1, relayedAt: 0, status: 'applied', duplicate: true }));
        expect(await applied.outbox.submit(req())).toBe('confirmed');
        const rejected = setup(async (r) => ({ commandId: r.commandId, seq: 1, relayedAt: 0, status: 'rejected', duplicate: true, resultCode: 'STALE' }));
        const r = req();
        expect(await rejected.outbox.submit(r)).toBe('rejected');
        expect(rejected.outbox.get(r.commandId)?.code).toBe('STALE');
    });

    it('network failure → failed (retryable); 422 → rejected; 401 → auth loss', async () => {
        const net = setup(async () => { throw new ApiError(0, 'NETWORK', 'x', true); });
        expect(await net.outbox.submit(req())).toBe('failed');
        const bad = setup(async () => { throw new ApiError(422, 'VALIDATION_FAILED', 'bad', false); });
        expect(await bad.outbox.submit(req())).toBe('rejected');
        const gone = setup(async () => { throw new ApiError(401, 'UNAUTHENTICATED', 'x', false); });
        expect(await gone.outbox.submit(req())).toBe('failed');
        expect(gone.onAuthLoss).toHaveBeenCalled();
    });

    it('rule 5: a reconnect turns awaiting entries into unconfirmed; discard removes', async () => {
        const { outbox } = setup();
        const r = req();
        const done = outbox.submit(r);
        await vi.waitFor(() => expect(outbox.get(r.commandId)?.status).toBe('awaiting'));
        outbox.invalidateAwaiting();
        expect(await done).toBe('unconfirmed');
        outbox.discard(r.commandId);
        expect(outbox.list()).toEqual([]);
        expect(await outbox.retry('nope')).toBe('failed');
        outbox.ack({ commandId: 'unknown', result: 'APPLIED' }); // ignored
    });
});
