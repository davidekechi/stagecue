import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ConnectionBadge from '../ConnectionBadge.vue';

describe('ConnectionBadge', () => {
    it('CMP-11 shows the four peer states and the server state', () => {
        const cases = [
            ['connected', 'Connected', 'ok'],
            ['synchronizing', 'Synchronizing', 'busy'],
            ['reconnecting', 'Reconnecting', 'warn'],
            ['disconnected', 'Disconnected', 'bad'],
        ] as const;
        for (const [peer, text, tone] of cases) {
            const w = mount(ConnectionBadge, { props: { server: 'online', peer } });
            const pill = w.find('[data-testid="badge-peer"]');
            expect(pill.text()).toBe(`Display ${text.toLowerCase()}`);
            expect(pill.attributes('data-tone')).toBe(tone);
            expect(pill.attributes('aria-label')).toBe(`Display ${text}`);
        }
        const offline = mount(ConnectionBadge, { props: { server: 'offline', peer: 'disconnected', peerLabel: 'Controller' } });
        expect(offline.find('[data-testid="badge-server"]').text()).toBe('Server offline');
        expect(offline.find('[data-testid="badge-server"]').attributes('data-tone')).toBe('bad');
        expect(offline.find('[data-testid="badge-peer"]').text()).toBe('Controller disconnected');
    });
});
