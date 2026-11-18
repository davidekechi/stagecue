// LLD §3.5 — readout formatting.

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Countdown: ceil to whole seconds so `15:00` shows for the whole first second and
 * `00:00` never appears while running. `H:MM:SS` from one hour, otherwise `MM:SS`.
 */
export function formatCountdown(remainingMs: number): string {
    const total = Math.max(0, Math.ceil(remainingMs / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

/** Overtime: floor to whole seconds, always `+HH:MM:SS`. */
export function formatOvertime(overtimeMs: number): string {
    const total = Math.max(0, Math.floor(overtimeMs / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `+${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

/** Splits a duration into h/m/s for pickers. */
export function splitDuration(ms: number): { h: number; m: number; s: number } {
    const total = Math.max(0, Math.round(ms / 1000));
    return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
}

export function joinDuration(h: number, m: number, s: number): number {
    return ((h * 60 + m) * 60 + s) * 1000;
}

/** Time of day in the device's local time zone, 12-hour, two-digit hours, AM/PM: "02:45 PM" (A23). */
export function formatClock(epochMs: number): string {
    const d = new Date(epochMs);
    const h24 = d.getHours();
    const h = h24 % 12 === 0 ? 12 : h24 % 12;
    // Seconds show the clock is live (product owner request).
    return `${pad2(h)}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())} ${h24 < 12 ? 'AM' : 'PM'}`;
}
