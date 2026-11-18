import { describe, expect, it } from 'vitest';
import { apply, command, internal, reject } from '../reducer';
import type { Action } from '../types';
import { fresh, ID_A, ok, run, T0, timedMsg } from './helpers';

const D = 900_000;

describe('reducer', () => {
    it('R-01 revision increments only when the state changed', () => {
        let s = fresh();
        s = ok(apply(s, command('TIMER_SET', { durationMs: D }), T0));
        expect(s.revision).toBe(1);
        expect(s.updatedAtWall).toBe(T0);
        const noop = apply(s, command('BLACKOUT_OFF'), T0 + 1);
        expect(noop).toMatchObject({ ok: true, changed: false, events: [] });
        expect(ok(noop)).toBe(s);
        const sync = apply(s, command('SYNC_REQUEST'), T0 + 2);
        expect(sync).toMatchObject({ ok: true, changed: false });
        s = ok(apply(s, command('BLACKOUT_ON'), T0 + 3));
        expect(s.revision).toBe(2);
        expect(s.updatedAtWall).toBe(T0 + 3);
        const rejected = apply(s, command('TIMER_PAUSE'), T0 + 4);
        expect(rejected).toMatchObject({ ok: false, code: 'INVALID_STATE' });
    });

    it('R-02 a destructive command with an outdated baseRevision → STALE_VIEW', () => {
        let s = run(fresh(), [['TIMER_SET', { durationMs: D }, T0], ['TIMER_START', {}, T0]]);
        expect(s.revision).toBe(2);
        for (const name of ['TIMER_SET', 'TIMER_RESET', 'TIMER_CLEAR', 'PRESENTATION_NEW'] as const) {
            const payload = name === 'TIMER_SET' ? { durationMs: 60_000 } : {};
            expect(apply(s, command(name, payload, { baseRevision: 1 }), T0 + 10)).toMatchObject({ ok: false, code: 'STALE_VIEW' });
            expect(apply(s, command(name, payload, { baseRevision: 2 }), T0 + 10).ok).toBe(true);
            expect(apply(s, command(name, payload, { baseRevision: null }), T0 + 10).ok).toBe(true);
        }
        // Non-destructive commands are not gated by baseRevision.
        s = ok(apply(s, command('TIMER_PAUSE', {}, { baseRevision: 0 }), T0 + 10));
        expect(s.timer.status).toBe('paused');
    });

    it('rejects unknown commands and invalid payloads', () => {
        const bogus = { kind: 'command', name: 'TIMER_EXPLODE', payload: {}, commandId: 'x', baseRevision: null } as unknown as Action;
        expect(apply(fresh(), bogus, T0)).toMatchObject({ ok: false, code: 'UNKNOWN_COMMAND' });
        expect(apply(fresh(), command('TIMER_SET', { durationMs: 'soon' }), T0)).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' });
        expect(apply(fresh(), command('TIMER_SET', undefined), T0)).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' });
        expect(reject('STALE').ok).toBe(false);
    });

    it('emits the domain events from the catalogue', () => {
        let s = fresh();
        const ev = (a: Action, at: number) => {
            const r = apply(s, a, at);
            s = ok(r);
            return r.ok ? r.events : [];
        };
        expect(ev(command('TIMER_SET', { durationMs: 1_000 }), T0)).toEqual(['TimerSet']);
        expect(ev(command('TIMER_START'), T0)).toEqual(['TimerStarted']);
        expect(ev(command('TIMER_PAUSE'), T0 + 100)).toEqual(['TimerPaused']);
        expect(ev(command('TIMER_RESUME'), T0 + 200)).toEqual(['TimerResumed']);
        expect(ev(internal('TIMER_EXPIRED'), T0 + 1_100)).toEqual(['TimerExpired', 'OvertimeStarted']);
        expect(ev(command('TIMER_RESET'), T0 + 2_000)).toEqual(['TimerReset']);
        expect(ev(command('TIMER_CLEAR'), T0 + 2_000)).toEqual(['TimerCleared']);
        expect(ev(command('MESSAGE_SHOW', timedMsg()), T0)).toEqual(['MessageShown']);
        expect(ev(command('MESSAGE_SHOW', timedMsg()), T0)).toEqual(['MessageReplaced']);
        expect(ev(command('MESSAGE_DISMISS', { id: ID_A }), T0)).toEqual(['MessageDismissed']);
        expect(ev(command('MESSAGE_SHOW', timedMsg(5_000)), T0)).toEqual(['MessageShown']);
        expect(ev(internal('MESSAGE_EXPIRED'), T0 + 5_000)).toEqual(['MessageExpired']);
        expect(ev(command('BLACKOUT_ON'), T0)).toEqual(['BlackoutOn']);
        expect(ev(command('BLACKOUT_OFF'), T0)).toEqual(['BlackoutOff']);
        expect(ev(command('SETTINGS_UPDATE', { defaultCorner: 'bl' }), T0)).toEqual(['SettingsUpdated']);
        expect(ev(command('SETTINGS_UPDATE', { defaultCorner: 'bl' }), T0)).toEqual([]);
    });

    it('internal expiry events are idempotent no-ops when not due', () => {
        const s = run(fresh(), [['TIMER_SET', { durationMs: D }, T0], ['TIMER_START', {}, T0], ['MESSAGE_SHOW', timedMsg(), T0]]);
        expect(apply(s, internal('TIMER_EXPIRED'), T0 + D - 1)).toMatchObject({ ok: true, changed: false });
        expect(apply(s, internal('MESSAGE_EXPIRED'), T0 + 9_999)).toMatchObject({ ok: true, changed: false });
    });

    it('PRESENTATION_NEW starts a fresh epoch at revision 0 and keeps the settings', () => {
        const s = run(fresh(), [['SETTINGS_UPDATE', { defaultCorner: 'bl' }, T0], ['TIMER_SET', { durationMs: D }, T0], ['BLACKOUT_ON', {}, T0]]);
        const r = apply(s, command('PRESENTATION_NEW'), T0 + 5, { newPresentationId: () => 'NEWID' });
        expect(r).toMatchObject({ ok: true, changed: true, events: ['PresentationStarted'] });
        const n = ok(r);
        expect(n).toMatchObject({ presentationId: 'NEWID', revision: 0, timer: { status: 'idle' }, display: { blackout: false, clock: false }, updatedAtWall: T0 + 5 });
        expect(n.settings.defaultCorner).toBe('bl');
        expect(ok(apply(s, command('PRESENTATION_NEW'), T0)).presentationId).toMatch(/^[0-9A-Z]{26}$/);
    });

    it('SETTINGS_UPDATE merges only the provided keys', () => {
        const s = ok(apply(fresh(), command('SETTINGS_UPDATE', { overtimeInterruptsMessage: true }), T0));
        expect(s.settings).toEqual({ defaultCorner: 'tr', overtimeInterruptsMessage: true, defaultMessageDurationMs: 10_000 });
    });

    describe('A2 — timer expiry while a message is visible', () => {
        const base = () => run(fresh(), [['TIMER_SET', { durationMs: 10_000 }, T0], ['TIMER_START', {}, T0]]);

        it('R-06 default: a timed message stays until it expires', () => {
            let s = ok(apply(base(), command('MESSAGE_SHOW', timedMsg(8_000)), T0 + 5_000));
            s = ok(apply(s, internal('TIMER_EXPIRED'), T0 + 10_000));
            expect(s.timer.status).toBe('overtime');
            expect(s.message.status).toBe('showing');
            s = ok(apply(s, internal('MESSAGE_EXPIRED'), T0 + 13_000));
            expect(s.message.status).toBe('none');
        });

        it('R-07 overtimeInterruptsMessage=true removes the message at expiry', () => {
            let s = ok(apply(base(), command('SETTINGS_UPDATE', { overtimeInterruptsMessage: true }), T0));
            s = ok(apply(s, command('MESSAGE_SHOW', timedMsg(8_000)), T0 + 5_000));
            const r = apply(s, internal('TIMER_EXPIRED'), T0 + 10_000);
            expect(r.ok && r.events).toEqual(['TimerExpired', 'OvertimeStarted', 'MessageDismissed']);
            expect(ok(r).message.status).toBe('none');
        });

        it('R-08 a persistent message stays in overtime until dismissed', () => {
            let s = ok(apply(base(), command('MESSAGE_SHOW', { id: ID_A, text: 'Wrap up', mode: 'persistent' }), T0 + 5_000));
            s = ok(apply(s, internal('TIMER_EXPIRED'), T0 + 10_000));
            s = ok(apply(s, internal('MESSAGE_EXPIRED'), T0 + 3_600_000));
            expect(s.message.status).toBe('showing');
            s = ok(apply(s, command('MESSAGE_DISMISS', { id: ID_A }), T0 + 3_600_000));
            expect(s.message.status).toBe('none');
        });
    });

    it('LLD §5.4 worked example', () => {
        const t0 = T0;
        let s = run(fresh(), [['TIMER_SET', { durationMs: D }, t0], ['TIMER_START', {}, t0], ['TIMER_PAUSE', {}, t0 + 60_000]]);
        expect(s.timer).toMatchObject({ status: 'paused', remainingMs: 840_000 });
        const t1 = t0 + 120_000;
        s = run(s, [['TIMER_RESUME', {}, t1], ['TIMER_EXPIRED', {}, t1 + 840_000], ['TIMER_PAUSE', {}, t1 + 852_000]]);
        expect(s.timer).toMatchObject({ status: 'paused', remainingMs: -12_000 });
        s = run(s, [['TIMER_RESUME', {}, t1 + 900_000]]);
        expect(s.timer).toMatchObject({ status: 'overtime', endsAtWall: t1 + 888_000 });
        s = run(s, [['TIMER_RESET', {}, t1 + 900_001]]);
        expect(s.timer).toEqual({ status: 'ready', durationMs: D });
    });
});
