import { describe, expect, it } from 'vitest';
import { openDB } from 'idb';

describe('test harness', () => {
    it('provides an isolated fake IndexedDB per test', async () => {
        const db = await openDB('harness', 1, { upgrade: (d) => d.createObjectStore('kv') });
        await db.put('kv', 42, 'answer');
        expect(await db.get('kv', 'answer')).toBe(42);
        db.close();
    });

    it('starts each test with an empty database', async () => {
        const db = await openDB('harness', 1, { upgrade: (d) => d.createObjectStore('kv') });
        expect(await db.get('kv', 'answer')).toBeUndefined();
        db.close();
    });
});
