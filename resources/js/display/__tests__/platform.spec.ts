import { afterEach, describe, expect, it, vi } from 'vitest';
import { CURSOR_HIDE_MS, Fullscreen } from '../Fullscreen';
import { FALLBACK_TEXT, isScreenPickerSupported, listScreens } from '../ScreenPicker';
import { WakeLock } from '../WakeLock';
import { acquireDisplayLock, holdsDisplayLock, releaseDisplayLock } from '../SingleTabLock';

function fakeDoc() {
    const target = new EventTarget();
    const doc = {
        fullscreenElement: null as unknown,
        visibilityState: 'visible' as DocumentVisibilityState,
        documentElement: { dataset: {} as Record<string, string>, requestFullscreen: vi.fn(async () => { doc.fullscreenElement = {}; target.dispatchEvent(new Event('fullscreenchange')); }) },
        exitFullscreen: vi.fn(async () => { doc.fullscreenElement = null; target.dispatchEvent(new Event('fullscreenchange')); }),
        addEventListener: target.addEventListener.bind(target),
        removeEventListener: target.removeEventListener.bind(target),
        fire: (type: string) => target.dispatchEvent(new Event(type)),
    };
    return doc;
}

describe('Fullscreen', () => {
    afterEach(() => vi.useRealTimers());

    it('enters with navigationUI hide and an optional screen, and toggles', async () => {
        const doc = fakeDoc();
        const onChange = vi.fn();
        const fs = new Fullscreen({ doc: doc as never, onChange });
        const dispose = fs.install();
        expect(fs.supported).toBe(true);
        expect(await fs.enter('SCREEN')).toBe(true);
        expect(doc.documentElement.requestFullscreen).toHaveBeenCalledWith({ navigationUI: 'hide', screen: 'SCREEN' });
        expect(fs.active).toBe(true);
        expect(onChange).toHaveBeenLastCalledWith(true);
        await fs.toggle();
        expect(fs.active).toBe(false);
        expect(onChange).toHaveBeenLastCalledWith(false);
        await fs.toggle();
        expect(fs.active).toBe(true);
        dispose();
    });

    it('reports failure when the request is rejected (no user gesture)', async () => {
        const doc = fakeDoc();
        doc.documentElement.requestFullscreen = vi.fn(async () => { throw new TypeError('no gesture'); });
        expect(await new Fullscreen({ doc: doc as never }).enter()).toBe(false);
        const unsupported = fakeDoc();
        (unsupported.documentElement as { requestFullscreen?: unknown }).requestFullscreen = undefined;
        expect(await new Fullscreen({ doc: unsupported as never }).enter()).toBe(false);
    });

    it('hides the cursor after 2 s without movement, only in fullscreen', async () => {
        vi.useFakeTimers();
        const doc = fakeDoc();
        const fs = new Fullscreen({ doc: doc as never });
        const dispose = fs.install();
        doc.fire('mousemove');
        vi.advanceTimersByTime(CURSOR_HIDE_MS + 10);
        expect(doc.documentElement.dataset.cursor).toBeUndefined();
        await fs.enter();
        vi.advanceTimersByTime(CURSOR_HIDE_MS - 10);
        expect(doc.documentElement.dataset.cursor).toBeUndefined();
        vi.advanceTimersByTime(20);
        expect(doc.documentElement.dataset.cursor).toBe('hidden');
        doc.fire('mousemove');
        expect(doc.documentElement.dataset.cursor).toBeUndefined();
        dispose();
    });
});

describe('ScreenPicker', () => {
    it('is unsupported without getScreenDetails', async () => {
        expect(isScreenPickerSupported({})).toBe(false);
        expect(await listScreens({})).toEqual({ ok: false, reason: 'unsupported' });
        expect(FALLBACK_TEXT).toMatch(/press F/);
    });

    it('lists screens with labels, resolution and the primary flag', async () => {
        const tv = { label: 'LG TV', width: 1920, height: 1080, isPrimary: false };
        const laptop = { label: '', width: 1512, height: 982, isPrimary: true };
        const r = await listScreens({ getScreenDetails: async () => ({ screens: [laptop, tv], currentScreen: laptop }) });
        expect(r).toEqual({
            ok: true,
            screens: [
                { label: 'Screen 1', width: 1512, height: 982, isPrimary: true, isCurrent: true, handle: laptop },
                { label: 'LG TV', width: 1920, height: 1080, isPrimary: false, isCurrent: false, handle: tv },
            ],
        });
    });

    it('handles a permission denial', async () => {
        const r = await listScreens({ getScreenDetails: async () => { throw new DOMException('no', 'NotAllowedError'); } });
        expect(r).toEqual({ ok: false, reason: 'denied' });
    });
});

describe('WakeLock', () => {
    function api() {
        const sentinels: Array<{ released: boolean; release: () => Promise<void>; addEventListener: (t: string, fn: () => void) => void; fire: () => void }> = [];
        return {
            sentinels,
            request: vi.fn(async () => {
                let onRelease = () => {};
                const s = {
                    released: false,
                    release: async () => { s.released = true; onRelease(); },
                    addEventListener: (_t: string, fn: () => void) => { onRelease = fn; },
                    fire: () => { s.released = true; onRelease(); },
                };
                sentinels.push(s);
                return s;
            }),
        };
    }

    it('is unsupported without the API', async () => {
        const wl = new WakeLock({ wakeLock: null, doc: fakeDoc() as never });
        expect(await wl.request()).toBe('unsupported');
    });

    it('acquires, and re-acquires on visibilitychange after the browser released it', async () => {
        const a = api();
        const doc = fakeDoc();
        const onChange = vi.fn();
        const wl = new WakeLock({ wakeLock: a, doc: doc as never, onChange });
        expect(await wl.request()).toBe('active');
        doc.visibilityState = 'hidden';
        a.sentinels[0]!.fire(); // the page was hidden
        expect(wl.state).toBe('released');
        doc.visibilityState = 'visible';
        doc.fire('visibilitychange');
        await vi.waitFor(() => expect(a.request).toHaveBeenCalledTimes(2));
        await vi.waitFor(() => expect(wl.state).toBe('active'));
        await wl.release();
        expect(wl.state).toBe('released');
        doc.fire('visibilitychange');
        expect(a.request).toHaveBeenCalledTimes(2);
        expect(onChange).toHaveBeenCalledWith('active');
    });

    it('survives a rejected request', async () => {
        const wl = new WakeLock({ wakeLock: { request: async () => { throw new Error('battery saver'); } } as never, doc: fakeDoc() as never });
        expect(await wl.request()).toBe('released');
    });
});

describe('SingleTabLock', () => {
    function fakeLocks() {
        const held = new Set<string>();
        return {
            request: (name: string, opts: { ifAvailable: boolean }, cb: (lock: unknown) => Promise<void>) => {
                if (held.has(name)) return cb(null);
                held.add(name);
                return cb({ name }).then(() => { held.delete(name); });
            },
        };
    }

    it('acquires once per browser; a second holder is busy until release', async () => {
        const locks = fakeLocks();
        expect(await acquireDisplayLock(locks, 'x')).toBe('acquired');
        expect(holdsDisplayLock()).toBe(true);
        releaseDisplayLock();
        await Promise.resolve();
        expect(holdsDisplayLock()).toBe(false);
        // Simulate another tab holding it.
        const other = fakeLocks();
        void other.request('y', { ifAvailable: true }, () => new Promise(() => {}));
        expect(await acquireDisplayLock(other, 'y')).toBe('busy');
        expect(await acquireDisplayLock(undefined)).toBe('unsupported');
    });
});
