import { describe, expect, it } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import { createPinia } from 'pinia';
import App from '@/App.vue';
import { createAppRouter } from '@/router';

async function mountAt(path: string) {
    const router = createAppRouter(createMemoryHistory());
    await router.push(path);
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [router, createPinia()] } });
    await flushPromises();
    return wrapper;
}

describe('router', () => {
    it.each([
        ['/', 'home-view'],
        ['/display', 'display-view'],
        ['/pair', 'pair-view'],
        ['/control', 'control-view'],
        ['/nope/at/all', 'not-found-view'],
    ])('renders %s', async (path, testId) => {
        const wrapper = await mountAt(path);
        expect(wrapper.find(`[data-testid="${testId}"]`).exists()).toBe(true);
    });
});
