// LLD §5.6 — pure message engine. Independent of the timer.
import type { Corner, MessageShowPayload, MessageState } from './types';

export function show(payload: MessageShowPayload, now: number, defaultCorner: Corner): MessageState {
    const timed = payload.mode === 'timed';
    const durationMs = timed ? (payload.durationMs ?? null) : null;
    return {
        status: 'showing',
        id: payload.id,
        text: payload.text,
        mode: payload.mode,
        durationMs,
        shownAtWall: now,
        expiresAtWall: timed && durationMs !== null ? now + durationMs : null,
        corner: payload.corner ?? defaultCorner,
    };
}

/** Dismisses the current message. A mismatched or absent id is an idempotent no-op. */
export function dismiss(message: MessageState, id?: string | null): { changed: boolean; message: MessageState } {
    if (message.status !== 'showing') return { changed: false, message };
    if (id && id !== message.id) return { changed: false, message };
    return { changed: true, message: { status: 'none' } };
}

export function isExpired(message: MessageState, now: number): boolean {
    return message.status === 'showing' && message.expiresAtWall !== null && now >= message.expiresAtWall;
}

/** Internal MESSAGE_EXPIRED. Ignored unless a timed message has reached its expiry. */
export function expire(message: MessageState, now: number): { changed: boolean; message: MessageState } {
    if (!isExpired(message, now)) return { changed: false, message };
    return { changed: true, message: { status: 'none' } };
}

/** Remaining ms of a timed message, `null` for none/persistent. */
export function remaining(message: MessageState, now: number): number | null {
    if (message.status !== 'showing' || message.expiresAtWall === null) return null;
    return Math.max(0, message.expiresAtWall - now);
}
