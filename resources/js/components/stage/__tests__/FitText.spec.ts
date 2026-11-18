import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import FitText from '../FitText.vue';

/** A fake layout: each character is 0.6em wide; lines wrap at the box width. */
function fakeLayout(el: HTMLElement, W: number, H: number, text: () => string) {
    const fontSize = () => parseFloat(el.style.fontSize || '16');
    Object.defineProperty(el, 'clientWidth', { get: () => W });
    Object.defineProperty(el, 'clientHeight', { get: () => H });
    Object.defineProperty(el, 'scrollWidth', {
        get: () => Math.max(...text().split('\n').map((w) => Math.min(W, w.length * 0.6 * fontSize())), ...text().split(/\s+/).map((w) => w.length * 0.6 * fontSize())),
    });
    Object.defineProperty(el, 'scrollHeight', {
        get: () => {
            const perLine = Math.max(1, Math.floor(W / (0.6 * fontSize())));
            const lines = text()
                .split('\n')
                .reduce((n, line) => n + Math.max(1, Math.ceil(line.length / perLine)), 0);
            return lines * 1.15 * fontSize();
        },
    });
}

describe('FitText', () => {
    it('CMP-07 long text shrinks to fit, short text grows to the cap', async () => {
        let text = 'Hi';
        const w = mount(FitText, { props: { text } });
        const box = w.find('[data-testid="fit-text"]').element as HTMLElement;
        fakeLayout(box, 1000, 500, () => text);

        (w.vm as unknown as { fit: () => void }).fit();
        const short = parseFloat(box.style.fontSize);
        expect(short).toBeCloseTo(500 * 0.4, 5); // the 40% cap

        text = 'Please make your way to the main hall, the keynote starts in five minutes. '.repeat(4);
        await w.setProps({ text });
        (w.vm as unknown as { fit: () => void }).fit();
        const long = parseFloat(box.style.fontSize);
        expect(long).toBeLessThan(short);
        expect(box.scrollHeight).toBeLessThanOrEqual(box.clientHeight);
        expect(long).toBeGreaterThanOrEqual(500 * 0.04);
    });

    it('keeps line breaks', () => {
        const w = mount(FitText, { props: { text: 'one\ntwo' } });
        expect(w.find('.fit-text-inner').text()).toBe('one\ntwo');
    });
});
