import { describe, expect, it } from 'vitest';
import { guessDeviceName, isIosBrowserTab, isValidCode, normalizeCode, parsePairUrl, tokenFromHash } from '../QrScanner';

const TOKEN = 'q3mAbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-Za';

describe('pairing input', () => {
    it('normalizes codes: upper-case, ambiguous characters dropped, 6 max', () => {
        expect(normalizeCode('7kq2mx')).toBe('7KQ2MX');
        expect(normalizeCode('7k q-2 m x')).toBe('7KQ2MX');
        expect(normalizeCode('O0I1L7KQ2MXZZ')).toBe('7KQ2MX');
        expect(isValidCode('7KQ2MX')).toBe(true);
        expect(isValidCode('7KQ2M')).toBe(false);
        expect(isValidCode('7KQ2M0')).toBe(false);
    });

    it('reads the token from the fragment', () => {
        expect(tokenFromHash(`#t=${TOKEN}`)).toBe(TOKEN);
        expect(tokenFromHash('#t=short')).toBeNull();
        expect(tokenFromHash('')).toBeNull();
    });

    it('accepts only same-origin /pair#t= URLs from the scanner', () => {
        const origin = 'https://stagecue.test';
        expect(parsePairUrl(`https://stagecue.test/pair#t=${TOKEN}`, origin)).toBe(TOKEN);
        expect(parsePairUrl(`https://evil.test/pair#t=${TOKEN}`, origin)).toBeNull();
        expect(parsePairUrl(`https://stagecue.test/control#t=${TOKEN}`, origin)).toBeNull();
        expect(parsePairUrl('not a url', origin)).toBeNull();
        expect(parsePairUrl('WIFI:S:venue;;', origin)).toBeNull();
    });

    it('detects an iOS browser tab (not the installed app)', () => {
        const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';
        expect(isIosBrowserTab({ userAgent: iphone, maxTouchPoints: 5 }, false)).toBe(true);
        expect(isIosBrowserTab({ userAgent: iphone, maxTouchPoints: 5, standalone: true }, false)).toBe(false);
        expect(isIosBrowserTab({ userAgent: iphone, maxTouchPoints: 5 }, true)).toBe(false);
        expect(isIosBrowserTab({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)', maxTouchPoints: 5 }, false)).toBe(false);
    });

    it('guesses a device name', () => {
        expect(guessDeviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('iPhone');
        expect(guessDeviceName('Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A) Chrome')).toBe('Pixel 8');
        expect(guessDeviceName('Mozilla/5.0 (Linux; Android 10; K) Chrome/120')).toBe('Android phone');
        expect(guessDeviceName('Mozilla/5.0 (Windows NT 10.0)')).toBe('Phone');
    });
});
