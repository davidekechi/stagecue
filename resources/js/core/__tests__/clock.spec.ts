import { describe, expect, it } from 'vitest';
import { FakeClock, systemClock } from '../clock';

describe('FakeClock', () => {
    it('starts at the given wall and mono values', () => {
        const c = new FakeClock(1000, 5);
        expect(c.wallNow()).toBe(1000);
        expect(c.monoNow()).toBe(5);
    });

    it('advance moves both clocks', () => {
        const c = new FakeClock(1000, 5);
        c.advance(250);
        expect(c.wallNow()).toBe(1250);
        expect(c.monoNow()).toBe(255);
    });

    it('jumpWall moves only the wall clock, in either direction', () => {
        const c = new FakeClock(1000, 5);
        c.jumpWall(10_000);
        expect(c.wallNow()).toBe(11_000);
        c.jumpWall(-20_000);
        expect(c.wallNow()).toBe(-9_000);
        expect(c.monoNow()).toBe(5);
    });

    it('suspend advances wall time but not monotonic time', () => {
        const c = new FakeClock(1000, 5);
        c.suspend(60_000);
        expect(c.wallNow()).toBe(61_000);
        expect(c.monoNow()).toBe(5);
    });
});

describe('systemClock', () => {
    it('reads Date.now and performance.now', () => {
        const before = Date.now();
        const w = systemClock.wallNow();
        expect(w).toBeGreaterThanOrEqual(before);
        expect(systemClock.monoNow()).toBeGreaterThanOrEqual(0);
    });
});
