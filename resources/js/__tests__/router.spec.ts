import { describe, expect, it } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import { createPinia } from 'pinia';
import App from '@/App.vue';
import { createAppRouter } from '@/router';
import { getDb } from '@/storage/db';
import { DeviceRepo } from '@/storage/DeviceRepo';
import { getAccount, setAccount } from '@/account/account';
import { afterEach, beforeEach } from 'vitest';

async function mountAt(path: string) {
    const router = createAppRouter(createMemoryHistory());
    await router.push(path);
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [router, createPinia()] } });
    await flushPromises();
    return { wrapper, router };
}

describe('router', () => {
    beforeEach(() => setAccount({ id: 1, email: 'team@church.org', token: 'acct' }));

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

    describe('A24: sign-up page', () => {
        const showSignup = (on: boolean) => {
            document.getElementById('stagecue-config')?.remove();
            const el = document.createElement('script');
            el.id = 'stagecue-config';
            el.type = 'application/json';
            el.textContent = JSON.stringify({ signupPage: on });
            document.body.appendChild(el);
        };
        afterEach(() => document.getElementById('stagecue-config')?.remove());

        it.each(['/signup', '/register', '/login?mode=register'])('is hidden by default: %s lands on plain Log in', async (path) => {
            localStorage.clear();
            const { router, wrapper } = await mountAt(path);
            expect(router.currentRoute.value.path).toBe('/login');
            expect(router.currentRoute.value.query.mode).toBeUndefined();
            expect(wrapper.find('[data-testid="register-tab"]').exists()).toBe(false);
            expect(wrapper.find('[data-testid="login-confirm"]').exists()).toBe(false);
            expect(wrapper.find('[data-testid="login-no-signup"]').exists()).toBe(true);
        });

        it('keeps where the user was going', async () => {
            localStorage.clear();
            const { router } = await mountAt('/login?mode=register&next=%2Fpair');
            expect(router.currentRoute.value.fullPath).toBe('/login?next=/pair');
        });

        it('home has no Create an account link while hidden', async () => {
            localStorage.clear();
            const { wrapper } = await mountAt('/');
            expect(wrapper.find('[data-testid="home-register"]').exists()).toBe(false);
        });

        it('comes back when the server shows it', async () => {
            showSignup(true);
            localStorage.clear();
            const { router, wrapper } = await mountAt('/signup');
            expect(router.currentRoute.value.fullPath).toBe('/login?mode=register');
            expect(wrapper.find('[data-testid="register-tab"]').exists()).toBe(true);
            expect(wrapper.find('[data-testid="login-confirm"]').exists()).toBe(true);
        });
    });
});
