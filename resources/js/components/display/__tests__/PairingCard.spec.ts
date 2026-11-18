import { describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PairingCard from '../PairingCard.vue';

const T0 = 1_794_660_000_000;
const base = {
    phase: 'ready' as const,
    pairing: { code: '7KQ2MX', url: 'https://app.test/pair#t=abc', expiresAt: T0 + 125_000 },
    controller: null,
    connection: { server: 'online' as const, peer: 'disconnected' as const },
    now: () => T0,
};

describe('PairingCard', () => {
    it('shows the QR, the large code and the expiry countdown', async () => {
        const w = mount(PairingCard, { props: base });
        await flushPromises();
        await new Promise((r) => setTimeout(r, 20));
        await flushPromises();
        expect(w.find('[data-testid="pairing-code"]').text().replace(/\s/g, '')).toBe('7KQ2MX');
        expect(w.find('[data-testid="pairing-expiry"]').text()).toBe('Expires in 2:05');
        expect(w.find('[data-testid="pairing-qr"]').attributes('src')).toMatch(/^data:image\/png;base64,/);
        expect(w.find('[data-testid="connection-badge"]').text()).toContain('Controller disconnected');
    });

    it('emits regenerate and asks before revoking', async () => {
        const w = mount(PairingCard, { props: { ...base, controller: { id: 'c', name: "Dave's iPhone" } } });
        expect(w.find('[data-testid="controller-connected"]').text()).toContain("Paired with Dave's iPhone");
        await w.find('[data-testid="pairing-regenerate"]').trigger('click');
        expect(w.emitted('regenerate')).toHaveLength(1);
        await w.find('[data-testid="pairing-revoke"]').trigger('click');
        expect(w.emitted('revoke')).toBeUndefined();
        await w.find('[data-testid="pairing-revoke"]').trigger('click');
        expect(w.emitted('revoke')).toHaveLength(1);
    });

    it('explains offline and error phases', () => {
        expect(mount(PairingCard, { props: { ...base, phase: 'offline', pairing: null } }).find('[data-testid="pairing-offline"]').exists()).toBe(true);
        expect(mount(PairingCard, { props: { ...base, phase: 'error', pairing: null } }).find('[data-testid="pairing-error"]').exists()).toBe(true);
        expect(mount(PairingCard, { props: { ...base, pairing: null } }).find('[data-testid="pairing-secrets"]').exists()).toBe(false);
    });
});
