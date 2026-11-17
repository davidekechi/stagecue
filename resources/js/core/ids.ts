// Identifier helpers. UUIDv7 for commands (D10), ULID for presentation epochs.
import { v7 as uuidv7 } from 'uuid';

export { uuidv7 };

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** A ULID (26 chars, Crockford base32): 48-bit time + 80 random bits. */
export function ulid(now: number = Date.now(), random: (n: number) => Uint8Array = randomBytes): string {
    let time = '';
    let t = Math.max(0, Math.floor(now));
    for (let i = 0; i < 10; i++) {
        time = CROCKFORD.charAt(t % 32) + time;
        t = Math.floor(t / 32);
    }
    const bytes = random(16);
    let rand = '';
    for (let i = 0; i < 16; i++) rand += CROCKFORD.charAt((bytes[i] ?? 0) % 32);
    return time + rand;
}

function randomBytes(n: number): Uint8Array {
    const out = new Uint8Array(n);
    globalThis.crypto.getRandomValues(out);
    return out;
}
