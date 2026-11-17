import { describe, expect, it } from 'vitest';
import {
    commandEnvelopeSchema,
    commandRequestSchema,
    controllerPairedSchema,
    controllerRevokedSchema,
    heartbeatSchema,
    peerHeartbeatSchema,
    presentationStateSchema,
    sessionEndedSchema,
    snapshotBodySchema,
    stateEventSchema,
} from '../schemas';
import { COMMAND_NAMES, DESTRUCTIVE, isCommandName, makeCommand } from '../commands';

const fixtures = import.meta.glob<{ default: Record<string, unknown> }>('../../contracts/fixtures/*.json', { eager: true });
const fixture = (name: string) => structuredClone(fixtures[`../../contracts/fixtures/${name}.json`]!.default) as Record<string, unknown>;

describe('contract fixtures', () => {
    it.each(COMMAND_NAMES.map((n) => [n]))('command.%s parses as a command envelope', (name) => {
        const f = fixture(`command.${name}`);
        expect(f.name).toBe(name);
        expect(commandEnvelopeSchema.safeParse(f).success).toBe(true);
    });

    it.each(['idle', 'ready', 'running-message', 'paused-overtime', 'overtime-blackout', 'persistent-message'])('state.%s parses', (name) => {
        expect(presentationStateSchema.safeParse(fixture(`state.${name}`)).success).toBe(true);
    });

    it('parses the snapshot, the state event and the heartbeat', () => {
        expect(snapshotBodySchema.safeParse(fixture('snapshot')).success).toBe(true);
        expect(stateEventSchema.safeParse(fixture('event.state')).success).toBe(true);
        expect(heartbeatSchema.safeParse(fixture('heartbeat')).success).toBe(true);
    });

    it('parses the pairing and session events', () => {
        expect(controllerPairedSchema.safeParse(fixture('event.controller-paired')).success).toBe(true);
        expect(controllerRevokedSchema.safeParse(fixture('event.controller-revoked')).success).toBe(true);
        expect(sessionEndedSchema.safeParse(fixture('event.session-ended')).success).toBe(true);
        expect(peerHeartbeatSchema.safeParse(fixture('event.peer-heartbeat')).success).toBe(true);
    });
});

describe('negative cases', () => {
    const bad = (base: string, mutate: (f: Record<string, unknown>) => void, schema = commandEnvelopeSchema) => {
        const f = fixture(base);
        mutate(f);
        return schema.safeParse(f).success;
    };

    it('rejects a wrong contract version', () => expect(bad('command.TIMER_START', (f) => (f.v = 2))).toBe(false));
    it('rejects an unknown command name', () => expect(bad('command.TIMER_START', (f) => (f.name = 'TIMER_EXPLODE'))).toBe(false));
    it('rejects a non-uuid commandId', () => expect(bad('command.TIMER_START', (f) => (f.commandId = 'abc'))).toBe(false));
    it('rejects an out-of-range duration', () => {
        expect(bad('command.TIMER_SET', (f) => (f.payload = { durationMs: 999 }))).toBe(false);
        expect(bad('command.TIMER_SET', (f) => (f.payload = { durationMs: 86_400_000 }))).toBe(false);
        expect(bad('command.TIMER_SET', (f) => (f.payload = { durationMs: 1.5 }))).toBe(false);
    });
    it('rejects payload on empty-payload commands', () => expect(bad('command.TIMER_START', (f) => (f.payload = { x: 1 }))).toBe(false));
    it('rejects blank, whitespace and over-long message text', () => {
        const withText = (text: string) => (f: Record<string, unknown>) => (f.payload = { ...(f.payload as object), text });
        expect(bad('command.MESSAGE_SHOW', withText(''))).toBe(false);
        expect(bad('command.MESSAGE_SHOW', withText('   \n '))).toBe(false);
        expect(bad('command.MESSAGE_SHOW', withText('x'.repeat(501)))).toBe(false);
        expect(bad('command.MESSAGE_SHOW', withText('x'.repeat(500)))).toBe(true);
    });
    it('requires durationMs for timed messages only', () => {
        expect(bad('command.MESSAGE_SHOW', (f) => (f.payload = { ...(f.payload as object), durationMs: undefined }))).toBe(false);
        expect(bad('command.MESSAGE_SHOW', (f) => (f.payload = { ...(f.payload as object), mode: 'persistent', durationMs: null }))).toBe(true);
    });
    it('rejects an invalid corner', () => expect(bad('command.MESSAGE_SHOW', (f) => (f.payload = { ...(f.payload as object), corner: 'center' }))).toBe(false));
    it('rejects an unknown settings key', () => expect(bad('command.SETTINGS_UPDATE', (f) => (f.payload = { theme: 'dark' }))).toBe(false));
    it('rejects a state with an unknown timer status', () =>
        expect(bad('state.ready', (f) => (f.timer = { status: 'stopped' }), presentationStateSchema as never)).toBe(false));
    it('rejects a snapshot with more than 50 acks', () => {
        const f = fixture('snapshot');
        const ack = (f.acks as unknown[])[0];
        f.acks = Array.from({ length: 51 }, () => ack);
        expect(snapshotBodySchema.safeParse(f).success).toBe(false);
    });
    it('rejects a heartbeat with a bad role', () => expect(bad('heartbeat', (f) => (f.role = 'admin'), heartbeatSchema as never)).toBe(false));
});

describe('commands', () => {
    it('lists the 13 catalogue commands and the destructive set', () => {
        expect(COMMAND_NAMES).toHaveLength(13);
        expect([...DESTRUCTIVE].sort()).toEqual(['PRESENTATION_NEW', 'TIMER_CLEAR', 'TIMER_RESET', 'TIMER_SET']);
        expect(isCommandName('TIMER_SET')).toBe(true);
        expect(isCommandName('NOPE')).toBe(false);
    });

    it('makeCommand builds a valid request with a uuidv7 id', () => {
        const a = makeCommand('TIMER_SET', { durationMs: 60_000 }, 3, 1_794_660_000_000);
        const b = makeCommand('TIMER_START', {}, null);
        expect(commandRequestSchema.safeParse(a).success).toBe(true);
        expect(commandRequestSchema.safeParse(b).success).toBe(true);
        expect(a.commandId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(a.commandId).not.toBe(b.commandId);
        expect(a).toMatchObject({ v: 1, name: 'TIMER_SET', baseRevision: 3, issuedAt: 1_794_660_000_000 });
    });
});

describe('ids', () => {
    it('ulid encodes time first and is 26 Crockford characters', async () => {
        const { ulid } = await import('../ids');
        const a = ulid(1_794_660_000_000, (n) => new Uint8Array(n));
        expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
        expect(a.slice(10)).toBe('0'.repeat(16));
        expect(ulid(1_794_660_000_001) > a).toBe(true);
    });
});
