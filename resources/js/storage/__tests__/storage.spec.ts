import { describe, expect, it, vi } from 'vitest';
import { createInitialState } from '@/core/reducer';
import { openStageCueDb, requestPersistence, type ProcessedRecord } from '../db';
import { PresentationRepo, PROCESSED_LIMIT } from '../PresentationRepo';
import { ProcessedCommandRepo } from '../ProcessedCommandRepo';
import { DeviceRepo } from '../DeviceRepo';
import { DraftRepo } from '../DraftRepo';
import { MetaRepo } from '../MetaRepo';
import type { PresentationState } from '@/core/types';

const T0 = 1_794_660_000_000;
const state = (): PresentationState => ({
    ...createInitialState('01JD3S0000000000000000PRES', T0),
    revision: 4,
    timer: { status: 'running', durationMs: 900_000, endsAtWall: T0 + 900_000, startedAtWall: T0 },
    message: { status: 'showing', id: 'm1', text: 'Line\nbreak', mode: 'timed', durationMs: 10_000, shownAtWall: T0, expiresAtWall: T0 + 10_000, corner: 'bl' },
    display: { blackout: true },
});
const rec = (i: number): ProcessedRecord => ({ commandId: `0193a3b4-0000-7000-8000-${String(i).padStart(12, '0')}`, appliedAt: T0 + i, result: 'APPLIED' });

describe('PresentationRepo', () => {
    it('S-01 commit then load round-trips deep-equal', async () => {
        const repo = new PresentationRepo(await openStageCueDb());
        expect(await repo.load()).toBeNull();
        await repo.commit(state());
        expect(await repo.load()).toEqual(state());
    });

    it('S-02 a corrupt record is quarantined and load returns null with a warning flag', async () => {
        const db = await openStageCueDb();
        await db.put('presentation', { schema: 99, nonsense: true }, 'current');
        const repo = new PresentationRepo(db, () => 123);
        expect(await repo.load()).toBeNull();
        expect(repo.lastLoadCorrupt).toBe(true);
        expect(await db.get('presentation', 'current')).toBeUndefined();
        expect(await db.get('meta', 'corrupt-123')).toEqual({ schema: 99, nonsense: true });
        expect(await repo.load()).toBeNull();
        expect(repo.lastLoadCorrupt).toBe(false);
    });

    it('S-03 state and processed record are written atomically (neither or both)', async () => {
        const db = await openStageCueDb();
        const repo = new PresentationRepo(db);
        await repo.commit(state(), rec(1));
        expect(await db.count('processedCommands')).toBe(1);

        const next = { ...state(), revision: 5 };
        const broken = { appliedAt: T0, result: 'APPLIED' } as unknown as ProcessedRecord; // no keyPath → DataError mid-transaction
        await expect(repo.commit(next, broken)).rejects.toBeTruthy();
        expect((await repo.load())?.revision).toBe(4);
        expect(await db.count('processedCommands')).toBe(1);
    });

    it('trims processed commands to the newest 500', async () => {
        const db = await openStageCueDb();
        const repo = new PresentationRepo(db);
        const tx = db.transaction('processedCommands', 'readwrite');
        for (let i = 0; i < PROCESSED_LIMIT + 5; i++) void tx.store.put(rec(i));
        await tx.done;
        await repo.commit(state(), rec(10_000));
        expect(await db.count('processedCommands')).toBe(PROCESSED_LIMIT);
        const processed = new ProcessedCommandRepo(db);
        expect(await processed.has(rec(0).commandId)).toBe(false);
        expect(await processed.has(rec(5).commandId)).toBe(false);
        expect(await processed.has(rec(6).commandId)).toBe(true);
        expect(await processed.has(rec(10_000).commandId)).toBe(true);
    });
});

describe('ProcessedCommandRepo', () => {
    it('stores and finds results', async () => {
        const repo = new ProcessedCommandRepo(await openStageCueDb());
        await repo.put({ ...rec(1), result: 'REJECTED', code: 'STALE' });
        expect(await repo.get(rec(1).commandId)).toMatchObject({ result: 'REJECTED', code: 'STALE' });
        expect(await repo.has(rec(2).commandId)).toBe(false);
        expect(await repo.count()).toBe(1);
    });
});

describe('DeviceRepo, DraftRepo, MetaRepo', () => {
    it('keeps device credentials', async () => {
        const db = await openStageCueDb();
        const repo = new DeviceRepo(db, 'display');
        expect(await repo.get()).toBeNull();
        const cred = { role: 'display' as const, deviceId: 'd', sessionId: 's', token: 't', name: 'TV' };
        await repo.set(cred);
        expect(await repo.get()).toEqual(cred);
        const controller = new DeviceRepo(db, 'controller');
        expect(await controller.get()).toBeNull(); // roles never see each other's credentials
        await controller.set({ ...cred, role: 'controller', token: 'c' });
        expect((await repo.get())?.token).toBe('t');
        await repo.clear();
        expect(await repo.get()).toBeNull();
        expect((await controller.get())?.token).toBe('c');
    });

    it('lists drafts oldest first', async () => {
        const repo = new DraftRepo(await openStageCueDb());
        await repo.put({ id: 'b', createdAt: 2, kind: 'timer', name: 'TIMER_SET', payload: { durationMs: 1000 }, label: 'b' });
        await repo.put({ id: 'a', createdAt: 1, kind: 'timer', name: 'TIMER_SET', payload: { durationMs: 1000 }, label: 'a' });
        expect((await repo.list()).map((d) => d.id)).toEqual(['a', 'b']);
        await repo.delete('a');
        expect((await repo.list()).map((d) => d.id)).toEqual(['b']);
    });

    it('stores meta values and caps the error log at 200', async () => {
        const repo = new MetaRepo(await openStageCueDb());
        await repo.set('serverTimeOffsetMs', 42);
        expect(await repo.get('serverTimeOffsetMs')).toBe(42);
        for (let i = 0; i < 205; i++) await repo.logError({ at: i, message: `e${i}` });
        const errors = await repo.errors();
        expect(errors).toHaveLength(200);
        expect(errors[0]?.message).toBe('e5');
        expect(await repo.keys()).toContain('errors');
        await repo.delete('serverTimeOffsetMs');
        expect(await repo.get('serverTimeOffsetMs')).toBeUndefined();
    });
});

describe('requestPersistence', () => {
    it('returns null without the API, true when granted, false on failure', async () => {
        expect(await requestPersistence(undefined)).toBeNull();
        expect(await requestPersistence({ persist: vi.fn(async () => true), persisted: vi.fn(async () => false) })).toBe(true);
        expect(await requestPersistence({ persist: vi.fn(async () => false), persisted: vi.fn(async () => true) })).toBe(true);
        expect(await requestPersistence({ persist: vi.fn(async () => { throw new Error('x'); }), persisted: vi.fn(async () => false) })).toBe(false);
    });
});
