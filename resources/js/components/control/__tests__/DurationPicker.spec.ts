import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import DurationPicker from '../DurationPicker.vue';
import { clampUnit, digitsOnly, stepUnit } from '@/control/duration';

function setup(h = 0, m = 15, s = 0) {
    let value = { h, m, s };
    const w = mount(DurationPicker, { props: { modelValue: value, 'onUpdate:modelValue': (v: typeof value) => (value = v, w.setProps({ modelValue: v })) } });
    return { w, get: () => value };
}

describe('duration rules', () => {
    it('clamps each field to 0…max', () => {
        expect(clampUnit('h', 24)).toBe(23);
        expect(clampUnit('m', 75)).toBe(59);
        expect(clampUnit('s', 60)).toBe(59);
        expect(clampUnit('s', -3)).toBe(0);
        expect(clampUnit('m', Number.NaN)).toBe(0);
        expect(clampUnit('h', 7.9)).toBe(7);
    });

    it('wraps +/− within the field', () => {
        expect(stepUnit('h', 23, 1)).toBe(0);
        expect(stepUnit('h', 0, -1)).toBe(23);
        expect(stepUnit('m', 59, 1)).toBe(0);
        expect(stepUnit('m', 0, -1)).toBe(59);
        expect(stepUnit('s', 0, -1)).toBe(59);
        expect(stepUnit('s', 10, 1)).toBe(11);
    });

    it('keeps digits only', () => {
        expect(digitsOnly('1a2')).toBe('12');
        expect(digitsOnly('-5')).toBe('5');
        expect(digitsOnly('abc')).toBe('');
        expect(digitsOnly('123')).toBe('23');
    });
});

describe('DurationPicker', () => {
    it('+/− wrap independently; minutes never borrow from hours', async () => {
        const { w, get } = setup(0, 0, 0);
        await w.find('[data-testid="dur-m-down"]').trigger('click');
        expect(get()).toEqual({ h: 0, m: 59, s: 0 });
        await w.find('[data-testid="dur-m-up"]').trigger('click');
        expect(get()).toEqual({ h: 0, m: 0, s: 0 });
        await w.find('[data-testid="dur-h-down"]').trigger('click');
        expect(get().h).toBe(23);
        await w.find('[data-testid="dur-h-up"]').trigger('click');
        expect(get().h).toBe(0);
    });

    it('typing: numbers only, numeric keyboard, clamped to the maximum', async () => {
        const { w, get } = setup();
        const input = w.find('[data-testid="dur-m"]');
        expect(input.attributes('inputmode')).toBe('numeric');
        await input.trigger('focus');
        await input.setValue('4x5');
        expect(get().m).toBe(45);
        await input.setValue('99');
        expect(get().m).toBe(59);
        expect((input.element as HTMLInputElement).value).toBe('59');
        const hours = w.find('[data-testid="dur-h"]');
        await hours.trigger('focus');
        await hours.setValue('30');
        expect(get().h).toBe(23);
    });

    it('an emptied field becomes 0 when you leave it, and values show padded', async () => {
        const { w, get } = setup(0, 15, 30);
        const s = w.find('[data-testid="dur-s"]');
        await s.trigger('focus');
        await s.setValue('');
        await s.trigger('blur');
        expect(get().s).toBe(0);
        expect((w.find('[data-testid="dur-m"]').element as HTMLInputElement).value).toBe('15');
        expect((w.find('[data-testid="dur-h"]').element as HTMLInputElement).value).toBe('00');
    });

    it('quick chips set the whole duration', async () => {
        const { w, get } = setup(1, 2, 3);
        await w.find('[data-testid="chip-30"]').trigger('click');
        expect(get()).toEqual({ h: 0, m: 30, s: 0 });
    });
});
