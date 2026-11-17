import type { StageCueDB } from './db';

export interface ErrorEntry {
    at: number;
    message: string;
    context?: string;
}

export const ERROR_LOG_LIMIT = 200;

/** Small key/value store: server clock offset, realtime config, error log, flags. */
export class MetaRepo {
    constructor(private readonly db: StageCueDB) {}

    async get<T>(key: string): Promise<T | undefined> {
        return (await this.db.get('meta', key)) as T | undefined;
    }

    async set<T>(key: string, value: T): Promise<void> {
        await this.db.put('meta', value, key);
    }

    async delete(key: string): Promise<void> {
        await this.db.delete('meta', key);
    }

    /** Appends to the diagnostics error log, keeping the last 200 entries. */
    async logError(entry: ErrorEntry): Promise<void> {
        const tx = this.db.transaction('meta', 'readwrite');
        const log = ((await tx.store.get('errors')) as ErrorEntry[] | undefined) ?? [];
        log.push(entry);
        await tx.store.put(log.slice(-ERROR_LOG_LIMIT), 'errors');
        await tx.done;
    }

    async errors(): Promise<ErrorEntry[]> {
        return ((await this.get<ErrorEntry[]>('errors')) ?? []).slice();
    }

    async keys(): Promise<string[]> {
        return (await this.db.getAllKeys('meta')).map(String);
    }
}
