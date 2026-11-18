// T7.1 — pairing input helpers and the in-app QR scanner (HLD R4: iOS needs it inside the PWA).

export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_RE = /^[2-9A-HJKMNP-Z]{6}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** Upper-cases and drops characters that can never appear in a code (0, O, 1, I, L, spaces…). */
export function normalizeCode(input: string): string {
    return input
        .toUpperCase()
        .split('')
        .filter((c) => CODE_ALPHABET.includes(c))
        .join('')
        .slice(0, 6);
}

export function isValidCode(code: string): boolean {
    return CODE_RE.test(code);
}

/** Reads `#t=<token>` from a location hash. */
export function tokenFromHash(hash: string): string | null {
    const t = new URLSearchParams(hash.replace(/^#/, '')).get('t');
    return t && TOKEN_RE.test(t) ? t : null;
}

/** Accepts only same-origin `/pair#t=<token>` URLs from a scanned QR code. */
export function parsePairUrl(text: string, origin: string): string | null {
    try {
        const url = new URL(text.trim());
        if (url.origin !== origin || url.pathname !== '/pair') return null;
        return tokenFromHash(url.hash);
    } catch {
        return null;
    }
}

/** iOS Safari outside the installed app: its storage is separate from the PWA's (R4). */
export function isIosBrowserTab(nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> & { standalone?: boolean } = navigator, standaloneMedia = matchMediaSafe('(display-mode: standalone)')): boolean {
    const ios = /iPhone|iPad|iPod/.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1);
    return ios && !nav.standalone && !standaloneMedia;
}

function matchMediaSafe(q: string): boolean {
    try {
        return globalThis.matchMedia?.(q).matches ?? false;
    } catch {
        return false;
    }
}

/** A friendly default name for this phone, shown on the Display. */
export function guessDeviceName(ua: string = navigator.userAgent): string {
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    const android = ua.match(/Android[^;]*;\s*([^;)]+?)(?:\s+Build|\))/);
    if (android?.[1] && !/^K$|wv/.test(android[1])) return android[1].trim().slice(0, 60);
    if (/Android/.test(ua)) return 'Android phone';
    return 'Phone';
}

export interface ScannerHandle {
    stop(): void;
}

/** Starts the camera scanner on a <video>; resolves the first valid pairing token. */
export async function startScanner(video: HTMLVideoElement, origin: string, onToken: (token: string) => void, onRejected?: (text: string) => void): Promise<ScannerHandle> {
    const { default: QrScanner } = await import('qr-scanner');
    let done = false;
    const scanner = new QrScanner(
        video,
        (result) => {
            if (done) return;
            const token = parsePairUrl(result.data, origin);
            if (token) {
                done = true;
                scanner.stop();
                onToken(token);
            } else {
                onRejected?.(result.data);
            }
        },
        { preferredCamera: 'environment', returnDetailedScanResult: true, highlightScanRegion: false, maxScansPerSecond: 8 },
    );
    await scanner.start();
    return { stop: () => (scanner.stop(), scanner.destroy()) };
}
