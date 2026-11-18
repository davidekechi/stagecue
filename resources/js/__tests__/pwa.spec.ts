import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyUpdate, displayCanUpdate, registerServiceWorker, resetUpdateState, updateAvailable } from '@/pwa';

function fakeSW(state = 'installing') {
    const listeners: Array<() => void> = [];
    return {
        state,
        postMessage: vi.fn(),
        addEventListener: (_t: string, fn: () => void) => listeners.push(fn),
        set(s: string) {
            this.state = s;
            listeners.forEach((f) => f());
        },
    };
}

function setup(opts: { controller?: boolean; waiting?: boolean } = {}) {
    const reg = {
        waiting: opts.waiting ? fakeSW('installed') : null,
        installing: null as ReturnType<typeof fakeSW> | null,
        updatefound: [] as Array<() => void>,
        addEventListener(_t: string, fn: () => void) {
            this.updatefound.push(fn);
        },
    };
    const controllerChange: Array<() => void> = [];
    const container = {
        controller: opts.controller === false ? null : {},
        register: vi.fn(async () => reg),
        addEventListener: (_t: string, fn: () => void) => controllerChange.push(fn),
    };
    const reload = vi.fn();
    return { reg, container, reload, controllerChange };
}

describe('PWA-05 safe service worker updates', () => {
    afterEach(() => resetUpdateState());

    it('does nothing outside production builds', async () => {
        const { container } = setup();
        expect(await registerServiceWorker({ container: container as never, prod: false })).toBeNull();
        expect(container.register).not.toHaveBeenCalled();
    });

    it('flags an update that installs while a version is running, and waits', async () => {
        const { reg, container } = setup();
        await registerServiceWorker({ container: container as never, prod: true });
        expect(container.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
        expect(updateAvailable.value).toBe(false);
        const sw = fakeSW();
        reg.installing = sw;
        reg.updatefound.forEach((f) => f());
        sw.set('installed');
        expect(updateAvailable.value).toBe(true);
    });

    it('the very first install is not an "update"', async () => {
        const { reg, container } = setup({ controller: false });
        await registerServiceWorker({ container: container as never, prod: true });
        const sw = fakeSW();
        reg.installing = sw;
        reg.updatefound.forEach((f) => f());
        sw.set('installed');
        expect(updateAvailable.value).toBe(false);
    });

    it('apply activates the waiting worker and reloads only after it takes control', async () => {
        const { reg, container, reload, controllerChange } = setup({ waiting: true });
        await registerServiceWorker({ container: container as never, prod: true, reload });
        expect(updateAvailable.value).toBe(true);
        controllerChange.forEach((f) => f()); // a change we did not ask for never reloads
        expect(reload).not.toHaveBeenCalled();
        expect(applyUpdate()).toBe(true);
        expect(reg.waiting!.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
        controllerChange.forEach((f) => f());
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('the Display never updates while a timer runs or a message shows', () => {
        const s = (timer: string, message = 'none') => ({ timer: { status: timer }, message: { status: message } });
        expect(displayCanUpdate(null)).toBe(true);
        for (const t of ['idle', 'ready', 'paused']) expect(displayCanUpdate(s(t))).toBe(true);
        for (const t of ['running', 'overtime']) expect(displayCanUpdate(s(t))).toBe(false);
        expect(displayCanUpdate(s('idle', 'showing'))).toBe(false);
        expect(applyUpdate()).toBe(false); // nothing waiting
    });
});
