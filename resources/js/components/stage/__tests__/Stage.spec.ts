import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import Stage from '../Stage.vue';
import StageTimer from '../StageTimer.vue';
import StageOvertime from '../StageOvertime.vue';
import { COMPACT_HEIGHT_RATIO, computeTransform, DIGIT_CAP_RATIO, DIGIT_HEIGHT_RATIO, fitFontSize, OVERTIME_CENTER_RATIO, OVERTIME_HEIGHT_RATIO, textShape } from '../useTimerTransform';
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
    it('CMP-01 renders the text with tabular numerals; the stage shows the paused bars for ready/paused', () => {
        const w = mount(StageTimer, { props: { text: '15:00', placement: 'center', overtime: false, paused: true, stage: null } });
        expect(w.text()).toBe('15:00');
        expect(w.classes()).toContain('tabular');
        expect(w.attributes('aria-label')).toBe('15:00, paused');
        const stage = mount(Stage, { props: { view: { kind: 'timer', text: '15:00', paused: true, overtime: false } } });
        expect(stage.find('[data-testid="paused-indicator"]').exists()).toBe(true);
        const running = mount(Stage, { props: { view: timerView } });
        expect(running.find('[data-testid="paused-indicator"]').exists()).toBe(false);
    });

    it('uses a black pill in a corner and a red one in overtime', () => {
        const black = mount(StageTimer, { props: { text: '10:00', placement: 'tr', overtime: false, paused: false, stage: null } });
        expect(black.classes()).toContain('is-pill');
        expect(black.classes()).not.toContain('is-red');
        const red = mount(StageTimer, { props: { text: '+00:00:05', placement: 'tr', overtime: true, paused: true, stage: null } });
        expect(red.classes()).toContain('is-red');
    });

    it('toggles will-change only while transitioning', async () => {
        const w = mount(StageTimer, { props: { text: '1', placement: 'center', overtime: false, paused: false, stage: null } });
        await w.trigger('transitionstart');
        expect(w.classes()).toContain('is-moving');
        await w.trigger('transitionend');
        expect(w.classes()).not.toContain('is-moving');
    });
});

describe('timer fills the stage', () => {
    it('digits reach 70% of the height when the width allows, otherwise fill the safe width', () => {
        // A narrow readout (e.g. "5") on 16:9 is height-bound: digits = 70% of H.
        expect(fitFontSize(1920, 1080, 0.6) * DIGIT_CAP_RATIO).toBeCloseTo(DIGIT_HEIGHT_RATIO * 1080, 5);
        // "15:00" (~2.9 em wide) on 16:9 is width-bound: it spans 90% of the width.
        expect(fitFontSize(1920, 1080, 2.9) * 2.9).toBeCloseTo(0.9 * 1920, 5);
        // Unknown width → height-bound.
        expect(fitFontSize(1024, 768, 0) * DIGIT_CAP_RATIO).toBeCloseTo(DIGIT_HEIGHT_RATIO * 768, 5);
    });

    it('refits only when the readout format changes, never every second', () => {
        expect(textShape('14:59')).toBe(textShape('03:12'));
        expect(textShape('59:59')).not.toBe(textShape('1:00:00'));
    });
});

describe('CMP-05 timer transforms', () => {
    const parse = (t: string) => t.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([\d.]+)\)/)!.slice(1).map(Number) as [number, number, number];

    it.each([
        [1920, 1080],
        [1024, 768],
    ])('places the compact timer in each corner at %ix%i', (W, H) => {
        const w = 1500; // the full-size box (large)
        const h = 520;
        const k = (COMPACT_HEIGHT_RATIO * H) / h;
        const m = 0.04 * Math.min(W, H);
        for (const [corner, sx, sy] of [['tl', -1, -1], ['tr', 1, -1], ['bl', -1, 1], ['br', 1, 1]] as const) {
            const [dx, dy, scale] = parse(computeTransform(W, H, w, h, corner));
            expect(scale).toBeCloseTo(k, 3);
            expect(scale * h).toBeCloseTo(COMPACT_HEIGHT_RATIO * H, 0); // a fixed share of the stage
            // The scaled box sits inside the stage with margin m.
            const left = W / 2 + dx - (scale * w) / 2;
            const top = H / 2 + dy - (scale * h) / 2;
            expect(sx < 0 ? left : W - (left + scale * w)).toBeCloseTo(m, 0);
            expect(sy < 0 ? top : H - (top + scale * h)).toBeCloseTo(m, 0);
        }
        expect(computeTransform(W, H, w, h, 'center')).toBe('translate(-50%, -50%) translate(0px, 0px) scale(1)');
    });

    it('sets --timer-transform on the element from the measured sizes', async () => {
        const stage = document.createElement('div');
        Object.defineProperty(stage, 'clientWidth', { value: 1920 });
        Object.defineProperty(stage, 'clientHeight', { value: 1080 });
        const w = mount(StageTimer, { props: { text: '15:00', placement: 'center', overtime: false, paused: false, stage } });
        await w.setProps({ placement: 'br' });
        expect((w.element as HTMLElement).style.getPropertyValue('--timer-transform')).toMatch(/^translate\(-50%, -50%\) translate\([\d.]+px, [\d.]+px\) scale\([\d.]+\)$/);
        expect((w.element as HTMLElement).style.fontSize).toMatch(/px$/);
    });

    it('the full overtime counter is a fixed share of the stage, below the TIME UP! heading', () => {
        const [dx, dy, scale] = parse(computeTransform(1920, 1080, 1700, 400, 'overtime'));
        expect(dx).toBe(0);
        expect(dy).toBeCloseTo((OVERTIME_CENTER_RATIO - 0.5) * 1080, 1);
        expect(scale * 400).toBeCloseTo(OVERTIME_HEIGHT_RATIO * 1080, 0);
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
