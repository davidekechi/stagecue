import type { Draft, StageCueDB } from './db';

/** Commands saved while the Display was unreachable (FR-C6). Never sent automatically. */
export class DraftRepo {
    constructor(private readonly db: StageCueDB) {}

    async list(): Promise<Draft[]> {
        const all = await this.db.getAll('drafts');
        return all.sort((a, b) => a.createdAt - b.createdAt);
    }

    async put(draft: Draft): Promise<void> {
        await this.db.put('drafts', draft);
    }

    async delete(id: string): Promise<void> {
        await this.db.delete('drafts', id);
    }
}
