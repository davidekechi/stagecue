import { describe, expect, it } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import { createPinia } from 'pinia';
import App from '@/App.vue';
import { createAppRouter } from '@/router';
import { getDb } from '@/storage/db';
import { DeviceRepo } from '@/storage/DeviceRepo';

async function mountAt(path: string) {
    const router = createAppRouter(createMemoryHistory());
    await router.push(path);
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [router, createPinia()] } });
    await flushPromises();
    return { wrapper, router };
}

describe('router', () => {
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
});
