import type { ProcessedRecord, StageCueDB } from './db';
import { trimProcessed } from './PresentationRepo';

/** The Display's persisted dedupe set (LLD §6.7). */
export class ProcessedCommandRepo {
    constructor(private readonly db: StageCueDB) {}

    get(commandId: string): Promise<ProcessedRecord | undefined> {
        return this.db.get('processedCommands', commandId);
    }

    async has(commandId: string): Promise<boolean> {
        return (await this.db.getKey('processedCommands', commandId)) !== undefined;
    }

    /** Records a result that did not change the state (rejections, stale commands). */
    async put(record: ProcessedRecord): Promise<void> {
        await this.db.put('processedCommands', record);
        await trimProcessed(this.db);
    }

    count(): Promise<number> {
        return this.db.count('processedCommands');
    }
}
