import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import TimerPanel from '../TimerPanel.vue';
import BlackoutZone from '../BlackoutZone.vue';
import PreviewSheet from '../PreviewSheet.vue';
import DraftList from '../DraftList.vue';
import MessageComposer from '../MessageComposer.vue';
import { createInitialState } from '@/core/reducer';
import type { Mirror } from '@/control/MirrorClock';
import { previewView } from '@/control/PreviewModel';
import type { TimerStatus } from '@/core/types';

const mountTimer = (status: TimerStatus | null, canSend = true) =>
    mount(TimerPanel, { props: { status, canSend, latest: () => undefined, duration: { h: 0, m: 15, s: 0 }, 'onUpdate:duration': () => {} } });
const ids = (w: ReturnType<typeof mountTimer>) => w.findAll('button[data-testid^="btn-"]').map((b) => b.attributes('data-testid'));

describe('TimerPanel', () => {
    it('CMP-09 button matrix per timer state', () => {
        expect(ids(mountTimer('idle'))).toEqual(['btn-display', 'btn-display-start']);
        expect(ids(mountTimer('ready'))).toEqual(['btn-start', 'btn-display', 'btn-clear']);
        expect(ids(mountTimer('running'))).toEqual(['btn-pause', 'btn-reset', 'btn-clear', 'btn-display']);
        expect(ids(mountTimer('overtime'))).toEqual(['btn-pause', 'btn-reset', 'btn-clear', 'btn-display']);
        expect(ids(mountTimer('paused'))).toEqual(['btn-resume', 'btn-reset', 'btn-clear', 'btn-display']);
    });

    it('disables everything without a connection or a mirror', () => {
        for (const w of [mountTimer('ready', false), mountTimer(null)]) {
            for (const b of w.findAll('button[data-testid^="btn-"]')) expect(b.attributes('disabled')).toBeDefined();
        }
    });

    it('A4: destructive actions on an active timer need a second tap', async () => {
        const w = mountTimer('running');
        await w.find('[data-testid="btn-reset"]').trigger('click');
        expect(w.emitted('send')).toBeUndefined();
        expect(w.find('[data-testid="btn-reset"]').text()).toContain('Tap again');
        await w.find('[data-testid="btn-reset"]').trigger('click');
        expect(w.emitted('send')![0]!.slice(0, 2)).toEqual(['TIMER_RESET', {}]);
        await w.find('[data-testid="btn-pause"]').trigger('click');
        expect(w.emitted('send')![1]!.slice(0, 2)).toEqual(['TIMER_PAUSE', {}]);
    });

    it('A3: Display & start sends SET, then START after SET is confirmed', async () => {
        const w = mountTimer('idle');
        await w.find('[data-testid="btn-display-start"]').trigger('click');
        const [name, payload, done] = w.emitted('send')![0] as [string, object, (t: string) => void];
        expect([name, payload]).toEqual(['TIMER_SET', { durationMs: 900_000 }]);
        done('confirmed');
        expect(w.emitted('send')![1]!.slice(0, 2)).toEqual(['TIMER_START', {}]);
    });
});

describe('BlackoutZone', () => {
    afterEach(() => vi.useRealTimers());

    it('CMP-10 a 600 ms hold is required; a tap does nothing; restore is one tap', async () => {
        let now = 0;
        const frames: FrameRequestCallback[] = [];
        vi.spyOn(performance, 'now').mockImplementation(() => now);
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
        vi.stubGlobal('cancelAnimationFrame', () => frames.splice(0));
        const run = (t: number) => {
            now = t;
            const cbs = frames.splice(0);
            cbs.forEach((cb) => cb(t));
        };
        const w = mount(BlackoutZone, { props: { blackout: false } });
        const btn = w.find('[data-testid="hold-blackout"]');

        await btn.trigger('pointerdown', { pointerId: 1 });
        run(200);
        await btn.trigger('pointerup');
        run(900);
        await btn.trigger('click');
        expect(w.emitted('blackout')).toBeUndefined();

        await btn.trigger('pointerdown', { pointerId: 1 });
        run(1_000 + 300);
        run(1_000 + 700);
        expect(w.emitted('blackout')).toHaveLength(1);

        await w.setProps({ blackout: true });
        await w.find('[data-testid="restore"]').trigger('click');
        expect(w.emitted('restore')).toHaveLength(1);
        vi.unstubAllGlobals();
    });
});

const T = 1_794_660_000_000;
const mirror = (): Mirror => ({
    state: { ...createInitialState('P', T), revision: 3, timer: { status: 'running', durationMs: 900_000, startedAtWall: T, endsAtWall: T + 600_000 }, display: { blackout: true } },
    computed: { timerRemainingMs: 600_000, overtimeMs: 0, messageRemainingMs: null },
    capturedAtWall: T,
    receivedAtMono: 0,
    lastEvents: [],
    live: true,
});
const msg = { id: '0193a3b4-8c2e-7d11-9f0a-aaaaaaaaaaaa', text: 'Hello', mode: 'timed' as const, durationMs: 10_000, corner: 'bl' as const };

describe('Preview', () => {
    it('applies the draft to a clone and never mutates the mirror', () => {
        const m = mirror();
        const before = structuredClone(m);
        const v = previewView({ mirror: m, monoNow: 1_000, message: msg, asOvertime: false });
        expect(v).toMatchObject({ kind: 'message', message: { text: 'Hello', corner: 'bl' }, compact: { overtime: false } });
        expect(previewView({ mirror: m, monoNow: 1_000, message: msg, asOvertime: true })).toMatchObject({ compact: { text: '+00:00:05', overtime: true } });
        expect(m).toEqual(before);
        expect(previewView({ mirror: null, monoNow: 0, message: null, asOvertime: false })).toEqual({ kind: 'standby' });
    });

    it('CMP-12 renders the draft and does not call the network', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        const w = mount(PreviewSheet, { props: { mirror: mirror(), message: msg, canSend: true } });
        expect(w.find('[data-testid="stage-message"]').text()).toContain('Hello');
        await w.find('[data-testid="preview-overtime"]').setValue(true);
        expect(w.find('[data-testid="stage-timer"]').attributes('data-overtime')).toBe('true');
        expect(fetchSpy).not.toHaveBeenCalled();
        await w.find('[data-testid="preview-send"]').trigger('click');
        expect(w.emitted('send')).toHaveLength(1);
    });
});

describe('drafts', () => {
    it('OFF-11 offline: the composer saves a draft instead of sending; drafts send only on “Send now”', async () => {
        const c = mount(MessageComposer, { props: { canSend: false, showing: false, text: 'Hi', durationMs: 10_000, corner: 'tr' } });
        expect(c.find('[data-testid="msg-send"]').exists()).toBe(false);
        await c.find('[data-testid="msg-draft"]').trigger('click');
        expect(c.emitted('draft')).toHaveLength(1);

        const draft = { id: 'd1', createdAt: 1, kind: 'message' as const, name: 'MESSAGE_SHOW' as const, payload: msg, label: 'Hello' };
        const list = mount(DraftList, { props: { drafts: [draft], canSend: false } });
        expect(list.find('[data-testid="draft-send"]').attributes('disabled')).toBeDefined();
        await list.setProps({ canSend: true });
        await list.find('[data-testid="draft-send"]').trigger('click');
        await list.find('[data-testid="draft-discard"]').trigger('click');
        expect(list.emitted('send')).toEqual([['d1']]);
        expect(list.emitted('discard')).toEqual([['d1']]);
        await flushPromises();
    });

    it('counts characters and blocks blank messages', async () => {
        const c = mount(MessageComposer, { props: { canSend: true, showing: true, text: '   ', durationMs: null, corner: 'tr' } });
        expect(c.find('[data-testid="msg-counter"]').text()).toBe('497 characters left');
        expect(c.find('[data-testid="msg-preview"]').attributes('disabled')).toBeDefined();
        expect(c.find('[data-testid="msg-clear"]').exists()).toBe(true);
    });
});
