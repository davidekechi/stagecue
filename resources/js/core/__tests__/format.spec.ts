import { describe, expect, it } from 'vitest';
import { formatCountdown, formatOvertime, joinDuration, splitDuration } from '../format';

describe('formatCountdown', () => {
    // T-07
    it.each([
        [900_000, '15:00'],
        [899_001, '15:00'],
        [899_000, '14:59'],
        [1, '00:01'],
        [0, '00:00'],
        [-5, '00:00'],
    ])('%i ms → %s', (ms, text) => expect(formatCountdown(ms)).toBe(text));

    // T-08
    it.each([
        [3_600_000, '1:00:00'],
        [3_599_999, '1:00:00'],
        [3_599_000, '59:59'],
        [86_399_000, '23:59:59'],
        [5_025_000, '1:23:45'],
    ])('%i ms → %s', (ms, text) => expect(formatCountdown(ms)).toBe(text));
});

describe('formatOvertime', () => {
    it.each([
        [0, '+00:00:00'],
        [999, '+00:00:00'],
        [1_000, '+00:00:01'],
        [272_000, '+00:04:32'],
        [3_723_000, '+01:02:03'],
        [-10, '+00:00:00'],
    ])('%i ms → %s', (ms, text) => expect(formatOvertime(ms)).toBe(text));
});

describe('duration helpers', () => {
    it('splits and joins h/m/s', () => {
        expect(splitDuration(5_025_000)).toEqual({ h: 1, m: 23, s: 45 });
        expect(joinDuration(1, 23, 45)).toBe(5_025_000);
        expect(splitDuration(-1)).toEqual({ h: 0, m: 0, s: 0 });
    });
});
