import { describe, expect, it } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import { createPinia } from 'pinia';
import App from '@/App.vue';
import { createAppRouter } from '@/router';
import { getDb } from '@/storage/db';
import { DeviceRepo } from '@/storage/DeviceRepo';
import { getAccount, setAccount } from '@/account/account';
import { beforeEach } from 'vitest';

async function mountAt(path: string) {
    const router = createAppRouter(createMemoryHistory());
    await router.push(path);
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [router, createPinia()] } });
    await flushPromises();
    return { wrapper, router };
}

describe('router', () => {
    beforeEach(() => setAccount({ id: 1, username: 'team', token: 'acct' }));

    it.each([
        ['/', 'home-view'],
        ['/display', 'display-view'],
        ['/pair', 'pair-view'],
        ['/nope/at/all', 'not-found-view'],
    ])('renders %s', async (path, testId) => {
        const { wrapper } = await mountAt(path);
        expect(wrapper.find(`[data-testid="${testId}"]`).exists()).toBe(true);
    });

    it('sends /control to /pair without controller credentials', async () => {
        const { router } = await mountAt('/control');
        expect(router.currentRoute.value.path).toBe('/pair');
    });

    it('opens /control once paired', async () => {
        await new DeviceRepo(await getDb(), 'controller').set({ role: 'controller', deviceId: 'C', sessionId: 'S', token: 't', name: 'Phone' });
        const { router } = await mountAt('/control');
        expect(router.currentRoute.value.path).toBe('/control');
    });

    it.each(['/display', '/pair', '/control'])('A24: sends %s to the login screen when logged out', async (path) => {
        localStorage.clear();
        const { router, wrapper } = await mountAt(path);
        expect(router.currentRoute.value.path).toBe('/login');
        expect(router.currentRoute.value.query.next).toBe(path);
        expect(wrapper.find('[data-testid="login-view"]').exists()).toBe(true);
    });

    it('A24: keeps the QR token through the login redirect', async () => {
        localStorage.clear();
        const { router } = await mountAt('/pair#t=abc');
        expect(router.currentRoute.value.query.next).toBe('/pair#t=abc');
        expect(getAccount()).toBeNull();
    });

    it('A24: home offers log in when logged out', async () => {
        localStorage.clear();
        const { wrapper } = await mountAt('/');
        expect(wrapper.find('[data-testid="home-login"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="home-display"]').exists()).toBe(false);
    });
});
