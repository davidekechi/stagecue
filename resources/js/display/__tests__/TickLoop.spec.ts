import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TickLoop } from '../TickLoop';

const T0 = 1_794_660_000_250; // 250 ms past a second boundary

function makeDoc() {
    const listeners: Record<string, Array<() => void>> = {};
    return {
        visibilityState: 'visible' as DocumentVisibilityState,
        addEventListener: (type: string, fn: () => void) => (listeners[type] ??= []).push(fn),
        removeEventListener: (type: string, fn: () => void) => (listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn)),
        fire(type: string) {
            for (const fn of listeners[type] ?? []) fn();
        },
    };
}

describe('TickLoop', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(T0);
    });
    afterEach(() => vi.useRealTimers());

    const setup = (onTick: () => void = () => {}, extra: Partial<ConstructorParameters<typeof TickLoop>[0]> = {}) => {
        const doc = makeDoc();
        const ticks: number[] = [];
        const loop = new TickLoop({
            nowEff: () => Date.now(),
            monoNow: () => Date.now(),
            onTick: () => {
                ticks.push(Date.now());
                onTick();
            },
            document: doc as never,
            ...extra,
        });
        return { loop, ticks, doc };
    };

    it('computes the delay to just after the next second boundary', () => {
        expect(TickLoop.delayFor(1_000_250)).toBe(755);
        expect(TickLoop.delayFor(1_000_000)).toBe(1005);
        expect(TickLoop.delayFor(1_000_999)).toBe(6);
    });

    it('ticks immediately, then aligned to second boundaries', () => {
        const { loop, ticks } = setup();
        loop.start();
        expect(ticks).toEqual([T0]);
        vi.advanceTimersByTime(3_000);
        expect(ticks.slice(1).map((t) => t % 1000)).toEqual([5, 5, 5]);
        expect(ticks).toHaveLength(4);
        loop.stop();
        vi.advanceTimersByTime(5_000);
        expect(ticks).toHaveLength(4);
        expect(loop.isRunning).toBe(false);
    });

    it('start is idempotent', () => {
        const { loop, ticks } = setup();
        loop.start();
        loop.start();
        vi.advanceTimersByTime(1_000);
        expect(ticks).toHaveLength(2);
        loop.stop();
    });

    it('ticks immediately when the page becomes visible', () => {
        const { loop, ticks, doc } = setup();
        loop.start();
        vi.advanceTimersByTime(100);
        doc.visibilityState = 'hidden';
        doc.fire('visibilitychange');
        expect(ticks).toHaveLength(1);
        doc.visibilityState = 'visible';
        doc.fire('visibilitychange');
        expect(ticks).toHaveLength(2);
        loop.stop();
    });

    it('keeps ticking after an error in the tick callback', () => {
        const onError = vi.fn();
        let n = 0;
        const { loop, ticks } = setup(() => {
            if (n++ === 0) throw new Error('boom');
        }, { onError });
        loop.start();
        vi.advanceTimersByTime(2_000);
        expect(onError).toHaveBeenCalledTimes(1);
        expect(ticks.length).toBeGreaterThanOrEqual(3);
        loop.stop();
    });

    it('the rAF watchdog re-ticks when no tick happened for 3 s', () => {
        let rafCb: (() => void) | null = null;
        const st = vi.fn(() => 1); // a timer that never fires (throttled tab)
        const { loop, ticks } = setup(() => {}, {
            setTimeout: st,
            clearTimeout: () => {},
            requestAnimationFrame: (fn) => {
                rafCb = fn;
                return 1;
            },
            cancelAnimationFrame: () => (rafCb = null),
        });
        loop.start();
        expect(ticks).toHaveLength(1);
        vi.setSystemTime(T0 + 2_000);
        rafCb!();
        expect(ticks).toHaveLength(1);
        vi.setSystemTime(T0 + 3_500);
        rafCb!();
        expect(ticks).toHaveLength(2);
        loop.stop();
        expect(rafCb).toBeNull();
    });
});
