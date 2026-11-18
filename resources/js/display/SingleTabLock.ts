// D14 / LLD §4.5 — only one authoritative Display tab per browser (Web Locks API).

export const DISPLAY_LOCK = 'stagecue-display';

export type LockResult = 'acquired' | 'busy' | 'unsupported';

interface LocksLike {
    request(name: string, options: { ifAvailable: boolean }, cb: (lock: unknown) => Promise<void>): Promise<void>;
}

let release: (() => void) | null = null;

/** Acquires the display lock and holds it until `releaseDisplayLock()` (or the tab closes). */
export function acquireDisplayLock(locks: LocksLike | undefined = (globalThis.navigator as unknown as { locks?: LocksLike })?.locks, name = DISPLAY_LOCK): Promise<LockResult> {
    if (release) return Promise.resolve('acquired');
    if (!locks) return Promise.resolve('unsupported');
    return new Promise<LockResult>((resolve) => {
        locks
            .request(name, { ifAvailable: true }, (lock) => {
                if (!lock) {
                    resolve('busy');
                    return Promise.resolve();
                }
                resolve('acquired');
                // Hold the lock until released explicitly.
                return new Promise<void>((done) => {
                    release = () => {
                        release = null;
                        done();
                    };
                });
            })
            .catch(() => resolve('unsupported'));
    });
}

export function releaseDisplayLock(): void {
    release?.();
}

export function holdsDisplayLock(): boolean {
    return release !== null;
}
