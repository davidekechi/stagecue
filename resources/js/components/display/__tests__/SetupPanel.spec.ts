import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import SetupPanel from '../SetupPanel.vue';
import FullscreenHint from '../FullscreenHint.vue';
import { useDisplayStore } from '@/stores/display';
import { createInitialState } from '@/core/reducer';

const mountPanel = () =>
    mount(SetupPanel, {
        props: {
            loadErrors: async () => [{ at: 0, message: 'boom', context: 'tick' }],
            clockOffset: () => -12,
        },
    });

describe('SetupPanel', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('shows the sections, keyboard cheat-sheet and TV guide', () => {
        const w = mountPanel();
        expect(w.text()).toContain('Display setup');
        expect(w.text()).toContain('Black screen on / off');
        expect(w.find('[data-testid="connect-guide"]').text()).toContain('Win');
        expect(w.find('[data-testid="setup-warnings"]').exists()).toBe(false);
    });

    it('emits fullscreen, and asks twice before a new presentation', async () => {
        const w = mountPanel();
        await w.find('[data-testid="setup-fullscreen"]').trigger('click');
        expect(w.emitted('fullscreen')).toHaveLength(1);
        const btn = w.find('[data-testid="setup-new-presentation"]');
        await btn.trigger('click');
        expect(w.emitted('newPresentation')).toBeUndefined();
        expect(btn.text()).toContain('Click again');
        await btn.trigger('click');
        expect(w.emitted('newPresentation')).toHaveLength(1);
    });

    it('surfaces storage and wake-lock warnings', async () => {
        const store = useDisplayStore();
        store.sink.onWarning({ storageFailed: true, recoveredFromCorrupt: false });
        store.storagePersisted = false;
        store.wakeLock = 'unsupported';
        const w = mountPanel();
        const text = w.find('[data-testid="setup-warnings"]').text();
        expect(text).toContain('State not saved');
        expect(text).toContain('not persistent');
        expect(text).toContain('keep the screen awake');
    });

    it('fills the diagnostics drawer when opened', async () => {
        const store = useDisplayStore();
        store.sink.onState({ ...createInitialState('PID', 0), revision: 7 }, []);
        const w = mountPanel();
        const details = w.find('[data-testid="diagnostics"]');
        (details.element as HTMLDetailsElement).open = true;
        await details.trigger('toggle');
        await flushPromises();
        expect(w.find('[data-testid="diag-revision"]').text()).toBe('7');
        expect(details.text()).toContain('-12 ms');
        expect(details.text()).toContain('boom');
    });

    it('can be collapsed and expanded', async () => {
        const w = mountPanel();
        await w.find('[data-testid="setup-collapse"]').trigger('click');
        expect(w.find('[data-testid="setup-panel"]').exists()).toBe(false);
        await w.find('[data-testid="setup-expand"]').trigger('click');
        expect(w.find('[data-testid="setup-panel"]').exists()).toBe(true);
    });

    it('lists screens from the Window Management API and falls back on denial', async () => {
        const screen = { label: 'TV', width: 1920, height: 1080, isPrimary: false };
        (window as unknown as { getScreenDetails: unknown }).getScreenDetails = vi.fn(async () => ({ screens: [screen], currentScreen: null }));
        const w = mountPanel();
        await w.find('[data-testid="setup-pick-screen"]').trigger('click');
        await flushPromises();
        await w.find('[data-testid="screen-list"] button').trigger('click');
        expect(w.emitted('fullscreen')?.[0]).toEqual([screen]);
        (window as unknown as { getScreenDetails: unknown }).getScreenDetails = vi.fn(async () => {
            throw new Error('denied');
        });
        await w.find('[data-testid="setup-pick-screen"]').trigger('click');
        await flushPromises();
        expect(w.text()).toContain('Permission denied');
        delete (window as unknown as { getScreenDetails?: unknown }).getScreenDetails;
    });
});

describe('FullscreenHint', () => {
    afterEach(() => vi.useRealTimers());

    it('shows for 4 s when not fullscreen, never when fullscreen', async () => {
        vi.useFakeTimers();
        const w = mount(FullscreenHint, { props: { fullscreen: false } });
        await w.vm.$nextTick();
        expect(w.find('[data-testid="fullscreen-hint"]').exists()).toBe(true);
        vi.advanceTimersByTime(4_100);
        await w.vm.$nextTick();
        expect(w.find('[data-testid="fullscreen-hint"]').exists()).toBe(false);
        const fs = mount(FullscreenHint, { props: { fullscreen: true } });
        expect(fs.find('[data-testid="fullscreen-hint"]').exists()).toBe(false);
    });
});

describe('SetupPanel update banner (PWA-05)', () => {
    beforeEach(() => setActivePinia(createPinia()));
    afterEach(async () => (await import('@/pwa')).resetUpdateState());

    it('offers the update, but only when nothing is running or showing', async () => {
        const { updateAvailable } = await import('@/pwa');
        updateAvailable.value = true;
        const store = useDisplayStore();
        store.sink.onState({ ...createInitialState('P', 0), timer: { status: 'running', durationMs: 1000, startedAtWall: 0, endsAtWall: 1000 } }, []);
        const w = mountPanel();
        expect(w.find('[data-testid="update-banner"]').exists()).toBe(true);
        expect(w.find('[data-testid="update-apply"]').attributes('disabled')).toBeDefined();
        expect(w.find('[data-testid="update-wait"]').exists()).toBe(true);
        store.sink.onState({ ...createInitialState('P', 0), timer: { status: 'paused', durationMs: 1000, remainingMs: 500, pausedAtWall: 0, startedAtWall: 0 } }, []);
        await w.vm.$nextTick();
        expect(w.find('[data-testid="update-apply"]').attributes('disabled')).toBeUndefined();
    });
});
