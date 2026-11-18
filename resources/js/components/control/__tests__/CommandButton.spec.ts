import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import CommandButton from '../CommandButton.vue';
import type { PendingCommand } from '@/control/CommandOutbox';

const entry = (status: PendingCommand['status'], extra: Partial<PendingCommand> = {}): PendingCommand => ({
    commandId: 'c1',
    name: 'TIMER_START',
    request: {} as never,
    status,
    ...extra,
});

describe('CommandButton', () => {
    it('CMP-08 shows each lifecycle state', async () => {
        const w = mount(CommandButton, { props: { label: 'Start', testid: 'start' } });
        const btn = () => w.find('[data-testid="start"]');
        expect(btn().attributes('data-status')).toBe('idle');
        await btn().trigger('click');
        expect(w.emitted('press')).toHaveLength(1);

        await w.setProps({ entry: entry('sending') });
        expect(btn().attributes('disabled')).toBeDefined();
        expect(w.find('[data-testid="start-status"]').text()).toBe('Sending…');

        await w.setProps({ entry: entry('awaiting') });
        expect(w.find('[data-testid="start-status"]').text()).toBe('Waiting for the display…');

        await w.setProps({ entry: entry('confirmed') });
        expect(btn().attributes('data-status')).toBe('confirmed');
        expect(btn().attributes('disabled')).toBeUndefined();

        await w.setProps({ entry: entry('rejected', { message: 'That action is not possible in the current timer state.' }) });
        expect(w.find('[data-testid="start-status"]').text()).toContain('not possible');
        expect(w.find('[data-testid="start-retry"]').exists()).toBe(false);

        await w.setProps({ entry: entry('unconfirmed') });
        expect(w.find('[data-testid="start-status"]').text()).toBe('Not confirmed by the display.');
        await w.find('[data-testid="start-retry"]').trigger('click');
        expect(w.emitted('retry')).toEqual([['c1']]);
    });

    it('can be disabled', () => {
        const w = mount(CommandButton, { props: { label: 'Start', testid: 'start', disabled: true } });
        expect(w.find('[data-testid="start"]').attributes('disabled')).toBeDefined();
    });
});
