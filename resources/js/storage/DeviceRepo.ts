import type { DeviceRole } from '@/core/types';
import type { DeviceCredentials, StageCueDB } from './db';

/**
 * This device's credentials for ONE role. Keyed by role (not a single `self` key) so a Display and a
 * Controller can live in the same browser without overwriting each other (ambiguity log A20).
 */
export class DeviceRepo {
    constructor(
        private readonly db: StageCueDB,
        private readonly role: DeviceRole,
    ) {}

    async get(): Promise<DeviceCredentials | null> {
        const c = await this.db.get('device', this.role);
        return c && c.role === this.role ? c : null;
    }

    async set(credentials: DeviceCredentials): Promise<void> {
        await this.db.put('device', { ...credentials, role: this.role }, this.role);
    }

    async clear(): Promise<void> {
        await this.db.delete('device', this.role);
    }
}
