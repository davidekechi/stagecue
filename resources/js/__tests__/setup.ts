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
});
