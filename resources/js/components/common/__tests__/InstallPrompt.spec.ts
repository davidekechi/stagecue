import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import InstallPrompt from '../InstallPrompt.vue';

function promptEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
    const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
    e.prompt = vi.fn(async () => {});
    e.userChoice = Promise.resolve({ outcome });
    return e;
}

describe('InstallPrompt (T9.2)', () => {
    beforeEach(() => {
        // Node 25 ships a partial global localStorage that shadows happy-dom's: use a simple one.
        const data = new Map<string, string>();
        vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v), removeItem: (k: string) => data.delete(k) });
    });

    it('stays hidden until the browser offers installation', async () => {
        const w = mount(InstallPrompt, { props: { ios: false }, attachTo: document.body });
        expect(w.find('[data-testid="install-prompt"]').exists()).toBe(false);
        const e = promptEvent();
        window.dispatchEvent(e);
        await w.vm.$nextTick();
        expect(e.defaultPrevented).toBe(true);
        await w.find('[data-testid="install-button"]').trigger('click');
        await flushPromises();
        expect(e.prompt).toHaveBeenCalled();
        expect(w.find('[data-testid="install-prompt"]').exists()).toBe(false); // accepted
        w.unmount();
    });

    it('shows the Share → Add to Home Screen hint on iOS', () => {
        const w = mount(InstallPrompt, { props: { ios: true } });
        expect(w.find('[data-testid="install-ios"]').text()).toContain('Add to Home Screen');
        expect(w.find('[data-testid="install-button"]').exists()).toBe(false);
    });

    it('"Not now" is remembered', async () => {
        const w = mount(InstallPrompt, { props: { ios: true } });
        await w.find('[data-testid="install-dismiss"]').trigger('click');
        expect(w.find('[data-testid="install-prompt"]').exists()).toBe(false);
        const again = mount(InstallPrompt, { props: { ios: true } });
        await again.vm.$nextTick();
        expect(again.find('[data-testid="install-prompt"]').exists()).toBe(false);
    });

    it('hides once installed', async () => {
        const w = mount(InstallPrompt, { props: { ios: true }, attachTo: document.body });
        window.dispatchEvent(new Event('appinstalled'));
        await w.vm.$nextTick();
        expect(w.find('[data-testid="install-prompt"]').exists()).toBe(false);
        w.unmount();
    });
});
