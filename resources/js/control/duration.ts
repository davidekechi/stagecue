// Duration picker rules: each field stays within 0…max and the +/− buttons wrap.
export type DurationUnit = 'h' | 'm' | 's';

export const UNIT_MAX: Record<DurationUnit, number> = { h: 23, m: 59, s: 59 };

/** Below zero → 0, above the maximum → the maximum, fractions dropped. */
export function clampUnit(unit: DurationUnit, value: number): number {
    if (!Number.isFinite(value) || value < 0) return 0;
    return Math.min(UNIT_MAX[unit], Math.floor(value));
}

/** + at the maximum goes to 0; − at 0 goes to the maximum. */
export function stepUnit(unit: DurationUnit, value: number, delta: 1 | -1): number {
    const max = UNIT_MAX[unit];
    if (delta > 0) return value >= max ? 0 : value + 1;
    return value <= 0 ? max : value - 1;
}

/** Keeps digits only (at most the last two typed). */
export function digitsOnly(raw: string): string {
    return raw.replace(/\D/g, '').slice(-2);
}
