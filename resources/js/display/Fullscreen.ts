// LLD §4.5 — fullscreen control + cursor hiding while presenting.
export const CURSOR_HIDE_MS = 2_000;

type FsDocument = Pick<Document, 'fullscreenElement' | 'exitFullscreen' | 'addEventListener' | 'removeEventListener'> & {
    documentElement: Pick<HTMLElement, 'requestFullscreen' | 'dataset'>;
};

export interface FullscreenDeps {
    doc?: FsDocument;
    onChange?: (active: boolean) => void;
    setTimeout?: (fn: () => void, ms: number) => unknown;
    clearTimeout?: (h: unknown) => void;
}

export class Fullscreen {
    private readonly doc: FsDocument;
    private cursorTimer: unknown = null;
    private readonly st: (fn: () => void, ms: number) => unknown;
    private readonly ct: (h: unknown) => void;
    private readonly onChange = () => {
        const active = this.active;
        this.deps.onChange?.(active);
        this.showCursor();
    };
    private readonly onMove = () => this.showCursor();

    constructor(private readonly deps: FullscreenDeps = {}) {
        this.doc = deps.doc ?? (document as FsDocument);
        this.st = deps.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms));
        this.ct = deps.clearTimeout ?? ((h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>));
    }

    get supported(): boolean {
        return typeof this.doc.documentElement.requestFullscreen === 'function';
    }

    get active(): boolean {
        return !!this.doc.fullscreenElement;
    }

    /** Must be called from a user gesture. `screen` comes from the Window Management API. */
    async enter(screen?: unknown): Promise<boolean> {
        if (!this.supported) return false;
        try {
            const options: FullscreenOptions & { screen?: unknown } = { navigationUI: 'hide' };
            if (screen) options.screen = screen;
            await this.doc.documentElement.requestFullscreen(options);
            return true;
        } catch {
            return false;
        }
    }

    async exit(): Promise<void> {
        if (this.active) await this.doc.exitFullscreen().catch(() => undefined);
    }

    toggle(): Promise<unknown> {
        return this.active ? this.exit() : this.enter();
    }

    install(): () => void {
        this.doc.addEventListener('fullscreenchange', this.onChange);
        this.doc.addEventListener('mousemove', this.onMove);
        this.doc.addEventListener('pointerdown', this.onMove);
        return () => {
            this.doc.removeEventListener('fullscreenchange', this.onChange);
            this.doc.removeEventListener('mousemove', this.onMove);
            this.doc.removeEventListener('pointerdown', this.onMove);
            if (this.cursorTimer !== null) this.ct(this.cursorTimer);
            delete this.doc.documentElement.dataset.cursor;
        };
    }

    /** Shows the cursor and hides it again after 2 s of no movement, while in fullscreen. */
    private showCursor(): void {
        delete this.doc.documentElement.dataset.cursor;
        if (this.cursorTimer !== null) this.ct(this.cursorTimer);
        this.cursorTimer = null;
        if (!this.active) return;
        this.cursorTimer = this.st(() => {
            this.cursorTimer = null;
            if (this.active) this.doc.documentElement.dataset.cursor = 'hidden';
        }, CURSOR_HIDE_MS);
    }
}
