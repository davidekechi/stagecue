import { describe, expect, it, vi } from 'vitest';
import { authErrorMessage, clearAccount, getAccount, login, logout, register, setAccount, ACCOUNT_KEY } from '../account';
import { ApiClient } from '@/transport/ApiClient';

const respond = (status: number, body: unknown) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('account (A24)', () => {
    it('stores, reads and clears the logged-in account', () => {
        expect(getAccount()).toBeNull();
        setAccount({ id: 3, email: 'team@church.org', token: 't' });
        expect(getAccount()).toEqual({ id: 3, email: 'team@church.org', token: 't' });
        clearAccount();
        expect(getAccount()).toBeNull();
    });

    it('ignores damaged storage', () => {
        localStorage.setItem(ACCOUNT_KEY, '{nope');
        expect(getAccount()).toBeNull();
        localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ email: 'x@y.z' }));
        expect(getAccount()).toBeNull();
    });

    it('logs in and signs up, keeping the returned token', async () => {
        const fetch = vi.fn(async () => respond(200, { user: { id: 7, email: 'team@church.org' }, token: 'acct' }));
        const api = new ApiClient({ fetch });
        await login(api, 'team@church.org', 'pw');
        expect(getAccount()).toEqual({ id: 7, email: 'team@church.org', token: 'acct' });
        await register(api, 'team@church.org', 'pw', 'pw');
        const body = JSON.parse((fetch.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
        expect(body).toEqual({ email: 'team@church.org', password: 'pw', password_confirmation: 'pw' });
    });

    it('logs out locally even when the server cannot be reached', async () => {
        setAccount({ id: 1, email: 'team@church.org', token: 'acct' });
        const fetch = vi.fn(async () => {
            throw new TypeError('offline');
        });
        await logout(new ApiClient({ fetch }));
        expect(getAccount()).toBeNull();
        expect((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({ Authorization: 'Bearer acct' });
    });

    it('explains failures plainly', () => {
        expect(authErrorMessage('INVALID_CREDENTIALS')).toMatch(/don’t match/);
        expect(authErrorMessage('VALIDATION_FAILED', { email: ['An account with that email already exists.'] })).toBe('An account with that email already exists.');
        expect(authErrorMessage('REGISTRATION_CLOSED')).toMatch(/Ask your team/);
    });
});
