import { presentationStateSchema } from '@/core/schemas';
import type { PresentationState } from '@/core/types';
import type { ProcessedRecord, StageCueDB } from './db';

export const PROCESSED_LIMIT = 500;

/** Durable store for the Display's presentation state (write-through on every applied change). */
export class PresentationRepo {
    /** Set when the last load found a corrupt record (it was quarantined). */
    lastLoadCorrupt = false;

    constructor(
        private readonly db: StageCueDB,
        private readonly now: () => number = () => Date.now(),
    ) {}

    async load(): Promise<PresentationState | null> {
        this.lastLoadCorrupt = false;
        const raw = await this.db.get('presentation', 'current');
        if (raw === undefined) return null;
        const parsed = presentationStateSchema.safeParse(raw);
        if (parsed.success) return parsed.data as PresentationState;
        // Quarantine the corrupt record so it can be inspected, then start fresh.
        const tx = this.db.transaction(['presentation', 'meta'], 'readwrite');
        await Promise.all([tx.objectStore('meta').put(raw, `corrupt-${this.now()}`), tx.objectStore('presentation').delete('current'), tx.done]);
        this.lastLoadCorrupt = true;
        return null;
    }

    /** Writes the state and (optionally) the processed-command record in ONE transaction. */
    async commit(state: PresentationState, processed?: ProcessedRecord): Promise<void> {
        const tx = this.db.transaction(['presentation', 'processedCommands'], 'readwrite');
        const pending: Promise<unknown>[] = [];
        // Every request promise is observed so an abort never surfaces as an unhandled rejection.
        const track = <T>(p: Promise<T>) => {
            pending.push(p);
            p.catch(() => undefined);
        };
        track(tx.done);
        try {
            track(tx.objectStore('presentation').put(state, 'current'));
            if (processed) track(tx.objectStore('processedCommands').put(processed)); // may throw synchronously
            await Promise.all(pending);
        } catch (error) {
            try {
                tx.abort();
            } catch {
                // already finished or aborted
            }
            throw error;
        }
        if (processed) await trimProcessed(this.db);
    }
}

export async function trimProcessed(db: StageCueDB, limit: number = PROCESSED_LIMIT): Promise<number> {
    const tx = db.transaction('processedCommands', 'readwrite');
    const store = tx.objectStore('processedCommands');
    const excess = (await store.count()) - limit;
    let removed = 0;
    if (excess > 0) {
        let cursor = await store.index('appliedAt').openCursor();
        while (cursor && removed < excess) {
            await cursor.delete();
            removed++;
            cursor = await cursor.continue();
        }
    }
    await tx.done;
    return removed;
}
