import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import Stage from '../Stage.vue';
import StageTimer from '../StageTimer.vue';
import StageOvertime from '../StageOvertime.vue';
import { computeTransform } from '../useTimerTransform';
import type { View } from '@/core/view';

const timerView: View = { kind: 'timer', text: '15:00', paused: false, overtime: false };
const msg = (corner: 'tl' | 'tr' | 'bl' | 'br', overtime = false): View => ({
    kind: 'message',
    message: { text: 'Please take your seats', corner },
    compact: { text: overtime ? '+00:00:05' : '14:59', overtime },
});

describe('Stage', () => {
    it('CMP-02 renders the right children for each view kind', () => {
        const cases: Array<[View, { timer: boolean; message: boolean; overtime: boolean; black: boolean }]> = [
            [{ kind: 'standby' }, { timer: false, message: false, overtime: false, black: false }],
            [timerView, { timer: true, message: false, overtime: false, black: false }],
            [{ kind: 'overtime', text: '+00:00:03', paused: false }, { timer: true, message: false, overtime: true, black: false }],
            [msg('tr'), { timer: true, message: true, overtime: false, black: false }],
            [{ kind: 'message', message: { text: 'Hi', corner: 'tr' }, compact: null }, { timer: false, message: true, overtime: false, black: false }],
            [{ kind: 'black' }, { timer: false, message: false, overtime: false, black: true }],
        ];
        for (const [view, want] of cases) {
            const w = mount(Stage, { props: { view } });
            expect(w.find('[data-testid="stage-timer"]').exists(), view.kind).toBe(want.timer);
            expect(w.find('[data-testid="stage-message"]').exists(), view.kind).toBe(want.message);
            expect(w.find('[data-testid="stage-overtime"]').exists(), view.kind).toBe(want.overtime);
            expect(w.find('[data-testid="stage-black"]').exists(), view.kind).toBe(want.black);
            expect(w.find('[data-testid="stage"]').attributes('data-kind')).toBe(view.kind);
            w.unmount();
        }
    });

    it('standby is plain black with nothing rendered', () => {
        const w = mount(Stage, { props: { view: { kind: 'standby' } } });
        expect(w.text()).toBe('');
    });

    it('CMP-03 the timer element is not re-mounted across centre → corner → corner → centre', async () => {
        const w = mount(Stage, { props: { view: timerView } });
        const node = w.find('[data-testid="stage-timer"]').element;
        const placements: string[] = [];
        for (const view of [msg('tl'), msg('br'), msg('bl', true), timerView, { kind: 'black' } as View, timerView]) {
            await w.setProps({ view });
            await nextTick();
            const el = w.find('[data-testid="stage-timer"]');
            expect(el.element).toBe(node);
            placements.push(el.attributes('data-placement')!);
        }
        expect(placements).toEqual(['tl', 'br', 'bl', 'center', 'center', 'center']);
    });

    it('CMP-04 blackout leaves no visible descendants and hides the cursor', async () => {
        const w = mount(Stage, { props: { view: msg('tr') }, attachTo: document.body });
        await w.setProps({ view: { kind: 'black' } });
        const content = w.find('.stage-content');
        expect((content.element as HTMLElement).style.visibility).toBe('hidden');
        expect(content.attributes('aria-hidden')).toBe('true');
        const black = w.find('[data-testid="stage-black"]');
        expect(black.exists()).toBe(true);
        // Every rendered descendant is either the black layer or inside the hidden content.
        for (const el of w.element.querySelectorAll('*')) {
            expect(el === black.element || content.element.contains(el)).toBe(true);
        }
        expect((black.element as HTMLElement).style.cursor).toBe('none');
        w.unmount();
    });
});

describe('StageTimer', () => {
    it('CMP-01 renders the text with tabular numerals and a paused indicator', () => {
        const w = mount(StageTimer, { props: { text: '15:00', placement: 'center', overtime: false, paused: true, stage: null } });
        expect(w.text()).toContain('15:00');
        expect(w.classes()).toContain('tabular');
        expect(w.find('[data-testid="paused-indicator"]').exists()).toBe(true);
        expect(w.attributes('aria-label')).toBe('15:00, paused');
    });

    it('hides the paused indicator when compact, and uses the red pill in compact overtime', () => {
        const w = mount(StageTimer, { props: { text: '+00:00:05', placement: 'tr', overtime: true, paused: true, stage: null } });
        expect(w.find('[data-testid="paused-indicator"]').exists()).toBe(false);
        expect(w.classes()).toContain('is-pill');
    });

    it('toggles will-change only while transitioning', async () => {
        const w = mount(StageTimer, { props: { text: '1', placement: 'center', overtime: false, paused: false, stage: null } });
        await w.trigger('transitionstart');
        expect(w.classes()).toContain('is-moving');
        await w.trigger('transitionend');
        expect(w.classes()).not.toContain('is-moving');
    });
});

describe('CMP-05 timer transforms', () => {
    const k = 0.28;
    it.each([
        [1920, 1080],
        [1024, 768],
    ])('places the compact timer in each corner at %ix%i', (W, H) => {
        const w = 600;
        const h = 240;
        const m = 0.04 * Math.min(W, H);
        const x = W / 2 - m - (k * w) / 2;
        const y = H / 2 - m - (k * h) / 2;
        const parse = (t: string) => t.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([\d.]+)\)/)!.slice(1).map(Number);
        expect(parse(computeTransform(W, H, w, h, 'tl'))).toEqual([round(-x), round(-y), k]);
        expect(parse(computeTransform(W, H, w, h, 'tr'))).toEqual([round(x), round(-y), k]);
        expect(parse(computeTransform(W, H, w, h, 'bl'))).toEqual([round(-x), round(y), k]);
        expect(parse(computeTransform(W, H, w, h, 'br'))).toEqual([round(x), round(y), k]);
        expect(computeTransform(W, H, w, h, 'center')).toBe('translate(-50%, -50%) translate(0px, 0px) scale(1)');
        // The scaled box stays inside the stage with margin m.
        const left = W / 2 - x - (k * w) / 2;
        expect(left).toBeCloseTo(m, 5);
    });

    it('sets --timer-transform on the element from the measured sizes', async () => {
        const stage = document.createElement('div');
        Object.defineProperty(stage, 'clientWidth', { value: 1920 });
        Object.defineProperty(stage, 'clientHeight', { value: 1080 });
        const w = mount(StageTimer, { props: { text: '15:00', placement: 'center', overtime: false, paused: false, stage } });
        await w.setProps({ placement: 'br' });
        const style = (w.element as HTMLElement).style.getPropertyValue('--timer-transform');
        expect(style).toMatch(/^translate\(-50%, -50%\) translate\([\d.]+px, [\d.]+px\) scale\(0.28\)$/);
    });

    it('the full overtime placement sits below the TIME UP! heading', () => {
        expect(computeTransform(1920, 1080, 600, 240, 'overtime')).toBe('translate(-50%, -50%) translate(0px, 151.2px) scale(0.8)');
    });
});

describe('StageOvertime', () => {
    it('CMP-06 red background token, TIME UP! and the paused-in-overtime indicator', () => {
        const w = mount(StageOvertime, { props: { active: true, paused: false } });
        expect(w.text()).toContain('TIME UP!');
        expect(w.find('[data-testid="overtime-paused"]').exists()).toBe(false);
        const stage = mount(Stage, { props: { view: { kind: 'overtime', text: '+00:01:02', paused: true } } });
        expect(stage.find('[data-testid="stage-overtime"]').text()).toContain('PAUSED');
        expect(stage.find('[data-testid="stage-timer"]').text()).toMatch(/^\+\d{2}:\d{2}:\d{2}/);
        expect(stage.find('[data-testid="stage-timer"]').attributes('data-overtime')).toBe('true');
    });
});

function round(n: number) {
    return Math.round(n * 100) / 100;
}
