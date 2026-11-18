// Gives every test a fresh, spec-compliant IndexedDB implementation and no real network.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach } from 'vitest';
import { resetDbCache } from '@/storage/db';

beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbCache();
    // Unit tests never talk to a server; code under test sees "the server could not be reached".
    globalThis.fetch = (() => Promise.reject(new TypeError('network disabled in unit tests'))) as typeof fetch;
    // A fresh localStorage per test (Node 25's partial built-in one shadows happy-dom's).
    const data = new Map<string, string>();
    const storage = {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, String(v)),
        removeItem: (k: string) => void data.delete(k),
        clear: () => data.clear(),
        key: (i: number) => [...data.keys()][i] ?? null,
        get length() {
            return data.size;
        },
    };
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
});
