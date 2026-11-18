import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import { createPinia } from 'pinia';
import PairView from '../PairView.vue';
import { createAppRouter } from '@/router';
import { ApiError, type ApiClient } from '@/transport/ApiClient';
import { getDb } from '@/storage/db';
import { DeviceRepo } from '@/storage/DeviceRepo';
import { setAccount } from '@/account/account';

const TOKEN = 'q3mAbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-Za';
const ok = { session: { id: 'S1', displayName: 'Main Hall TV' }, device: { id: 'C1', role: 'controller' }, token: 'tok', realtime: { key: 'k', host: 'h', port: 443, scheme: 'https', heartbeatMode: 'whisper', staleMs: 10000 }, serverTime: 0 };

async function setup(pair: ApiClient['pair']) {
    setAccount({ id: 1, username: 'team', token: 'acct' });
    const router = createAppRouter(createMemoryHistory());
    await router.push('/pair');
    const api = { pair: vi.fn(pair) } as unknown as ApiClient;
    const w = mount(PairView, { props: { api }, global: { plugins: [router, createPinia()] } });
    await flushPromises();
    return { w, api, router };
}

describe('PairView', () => {
    it('normalizes the code, pairs, stores the credentials and opens the controller', async () => {
        const { w, api, router } = await setup(async () => ok as never);
        const input = w.find('[data-testid="pair-code"]');
        await input.setValue('7kq-2mx');
        await vi.waitFor(() => expect(api.pair).toHaveBeenCalledWith({ code: '7KQ2MX' }, expect.any(String), 'acct'));
        await vi.waitFor(async () => expect(await new DeviceRepo(await getDb(), 'controller').get()).not.toBeNull());
        expect(await new DeviceRepo(await getDb(), 'controller').get()).toMatchObject({ sessionId: 'S1', token: 'tok', sessionName: 'Main Hall TV' });
        await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/control'));
    });

    it('rejects ambiguous characters and keeps Pair disabled until 6 valid characters', async () => {
        const { w, api } = await setup(async () => ok as never);
        await w.find('[data-testid="pair-code"]').setValue('O0I1L7KQ');
        expect((w.find('[data-testid="pair-code"]').element as HTMLInputElement).value).toBe('7KQ');
        expect(w.find('[data-testid="pair-submit"]').attributes('disabled')).toBeDefined();
        expect(api.pair).not.toHaveBeenCalled();
    });

    it('explains failures in plain language', async () => {
        const { w } = await setup(async () => {
            throw new ApiError(410, 'PAIRING_EXPIRED', 'x', false);
        });
        await w.find('[data-testid="pair-code"]').setValue('7KQ2MX');
        await vi.waitFor(() => expect(w.find('[data-testid="pair-error"]').exists()).toBe(true));
        expect(w.find('[data-testid="pair-error"]').text()).toContain('expired');
    });

    it('pairs from a #t= link and strips the token from the address bar', async () => {
        history.replaceState(null, '', `/pair#t=${TOKEN}`);
        const replace = vi.spyOn(history, 'replaceState');
        const { api } = await setup(async () => ok as never);
        await vi.waitFor(() => expect(api.pair).toHaveBeenCalledWith({ token: TOKEN }, expect.any(String), 'acct'));
        expect(replace).toHaveBeenCalled();
        expect(location.hash).toBe('');
    });
});
