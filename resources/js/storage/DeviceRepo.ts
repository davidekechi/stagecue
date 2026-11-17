import type { DeviceCredentials, StageCueDB } from './db';

/** This device's credentials (`device['self']`). */
export class DeviceRepo {
    constructor(private readonly db: StageCueDB) {}

    async get(): Promise<DeviceCredentials | null> {
        return (await this.db.get('device', 'self')) ?? null;
    }

    async set(credentials: DeviceCredentials): Promise<void> {
        await this.db.put('device', credentials, 'self');
    }

    async clear(): Promise<void> {
        await this.db.delete('device', 'self');
    }
}
