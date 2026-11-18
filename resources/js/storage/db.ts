// LLD §4.9 / HLD §10 — the `stagecue` IndexedDB database (via idb).
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Ack, CommandName, CommandPayloads, Corner, DeviceRole, MessageMode, RejectCode } from '@/core/types';

export interface ProcessedRecord {
    commandId: string;
    appliedAt: number;
    result: 'APPLIED' | 'REJECTED';
    code?: RejectCode | null;
    message?: string | null;
    seq?: number | null;
}

export interface DeviceCredentials {
    role: DeviceRole;
    deviceId: string;
    sessionId: string;
    token: string;
    name: string;
    sessionName?: string | null;
}

export interface Draft {
    id: string;
    createdAt: number;
    kind: 'message' | 'timer';
    name: CommandName;
    payload: CommandPayloads[CommandName];
    /** Human summary for the list. */
    label: string;
    corner?: Corner | null;
    mode?: MessageMode | null;
}

export interface StageCueSchema extends DBSchema {
    presentation: { key: string; value: unknown };
    processedCommands: { key: string; value: ProcessedRecord; indexes: { appliedAt: number } };
    device: { key: string; value: DeviceCredentials }; // key = role (A20)
    drafts: { key: string; value: Draft };
    meta: { key: string; value: unknown };
}

export type StageCueDB = IDBPDatabase<StageCueSchema>;

export const DB_NAME = 'stagecue';
export const DB_VERSION = 1;

export function openStageCueDb(name: string = DB_NAME): Promise<StageCueDB> {
    return openDB<StageCueSchema>(name, DB_VERSION, {
        upgrade(db) {
            db.createObjectStore('presentation'); // key 'current'
            const pc = db.createObjectStore('processedCommands', { keyPath: 'commandId' });
            pc.createIndex('appliedAt', 'appliedAt');
            db.createObjectStore('device'); // key 'self'
            db.createObjectStore('drafts', { keyPath: 'id' });
            db.createObjectStore('meta'); // key/value
        },
    });
}

let shared: Promise<StageCueDB> | null = null;

/** The app-wide connection (lazily opened). */
export function getDb(): Promise<StageCueDB> {
    shared ??= openStageCueDb();
    return shared;
}

/** Test hook: forget the cached connection (each test gets a fresh IndexedDB). */
export function resetDbCache(): void {
    shared = null;
}

/** Best-effort persistent storage (FR-O4). `null` when the API is missing. */
export async function requestPersistence(storage: Pick<StorageManager, 'persist' | 'persisted'> | undefined = globalThis.navigator?.storage): Promise<boolean | null> {
    if (!storage?.persist) return null;
    try {
        if (await storage.persisted?.()) return true;
        return await storage.persist();
    } catch {
        return false;
    }
}

export type { Ack };
