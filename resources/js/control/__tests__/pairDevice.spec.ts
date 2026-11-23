import { describe, expect, it, vi } from 'vitest';
import { pairDevice, pairingErrorMessage } from '../pairDevice';
import type { ApiClient } from '@/transport/ApiClient';
import { getDb } from '@/storage/db';
import { DeviceRepo } from '@/storage/DeviceRepo';

const realtime = { key: 'k', host: 'h', port: 443, scheme: 'https', heartbeatMode: 'whisper', staleMs: 10_000 };
const res = (device: string) => ({ session: { id: 'S2', displayName: 'Hall' }, device: { id: device, role: 'controller' }, token: `tok-${device}`, realtime, serverTime: 0 });

describe('pairDevice (A28)', () => {
    it('leaves the previous pairing once the new one succeeds', async () => {
        const devices = new DeviceRepo(await getDb(), 'controller');
        await devices.set({ role: 'controller', deviceId: 'OLD', sessionId: 'S1', token: 'old-tok', name: 'Phone' });
        const api = { pair: vi.fn(async () => res('NEW')), request: vi.fn(async () => undefined) } as unknown as ApiClient;
        await pairDevice({ api, devices, accountToken: () => 'acct' }, { code: 'ABC234' }, 'Phone');
        expect(api.request).toHaveBeenCalledWith('DELETE', '/sessions/S1/controller/self', undefined, { bearer: 'old-tok' });
        expect(await devices.get()).toMatchObject({ deviceId: 'NEW', sessionId: 'S2' });
    });

    it('keeps the old pairing when the new one fails, and explains the phone limit', async () => {
        const devices = new DeviceRepo(await getDb(), 'controller');
        await devices.set({ role: 'controller', deviceId: 'OLD', sessionId: 'S1', token: 'old-tok', name: 'Phone' });
        const api = { pair: vi.fn(async () => Promise.reject(new Error('nope'))), request: vi.fn() } as unknown as ApiClient;
        await expect(pairDevice({ api, devices, accountToken: () => 'acct' }, { code: 'ABC234' }, 'Phone')).rejects.toThrow();
        expect(api.request).not.toHaveBeenCalled();
        expect((await devices.get())?.deviceId).toBe('OLD');
        expect(pairingErrorMessage('CONTROLLER_LIMIT')).toMatch(/most phones/);
    });
});
