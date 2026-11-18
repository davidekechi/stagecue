// LLD §4.5 / FR-D3 — keep the screen awake while presenting; re-acquire when visible again.

interface SentinelLike {
    released: boolean;
    release(): Promise<void>;
    addEventListener(type: 'release', fn: () => void): void;
}
interface WakeLockApi {
    request(type: 'screen'): Promise<SentinelLike>;
}

export type WakeLockState = 'active' | 'released' | 'unsupported';

export interface WakeLockDeps {
    wakeLock?: WakeLockApi | null;
    doc?: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
    onChange?: (state: WakeLockState) => void;
}

export class WakeLock {
    private sentinel: SentinelLike | null = null;
    private wanted = false;
    private readonly api: WakeLockApi | null;
    private readonly doc: WakeLockDeps['doc'];
    private readonly onVisibility = () => {
        if (this.doc?.visibilityState === 'visible' && this.wanted && !this.sentinel) void this.acquire();
    };

    constructor(private readonly deps: WakeLockDeps = {}) {
        this.api = deps.wakeLock !== undefined ? deps.wakeLock : ((globalThis.navigator as unknown as { wakeLock?: WakeLockApi })?.wakeLock ?? null);
        this.doc = deps.doc ?? (typeof document !== 'undefined' ? document : undefined);
    }

    get state(): WakeLockState {
        if (!this.api) return 'unsupported';
        return this.sentinel && !this.sentinel.released ? 'active' : 'released';
    }

    async request(): Promise<WakeLockState> {
        this.wanted = true;
        if (!this.api) return this.emit();
        this.doc?.addEventListener('visibilitychange', this.onVisibility);
        await this.acquire();
        return this.state;
    }

    async release(): Promise<void> {
        this.wanted = false;
        this.doc?.removeEventListener('visibilitychange', this.onVisibility);
        const s = this.sentinel;
        this.sentinel = null;
        await s?.release().catch(() => undefined);
        this.emit();
    }

    private async acquire(): Promise<void> {
        try {
            const s = await this.api!.request('screen');
            this.sentinel = s;
            // The browser releases the lock when the page is hidden; we re-acquire on visibility.
            s.addEventListener('release', () => {
                if (this.sentinel === s) this.sentinel = null;
                this.emit();
            });
        } catch {
            this.sentinel = null;
        }
        this.emit();
    }

    private emit(): WakeLockState {
        const st = this.state;
        this.deps.onChange?.(st);
        return st;
    }
}
