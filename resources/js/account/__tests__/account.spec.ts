import { describe, expect, it, vi } from 'vitest';
import { authErrorMessage, clearAccount, getAccount, login, logout, register, setAccount, ACCOUNT_KEY } from '../account';
import { ApiClient } from '@/transport/ApiClient';

const respond = (status: number, body: unknown) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('account (A24)', () => {
    it('stores, reads and clears the logged-in account', () => {
        expect(getAccount()).toBeNull();
        setAccount({ id: 3, username: 'team', token: 't' });
        expect(getAccount()).toEqual({ id: 3, username: 'team', token: 't' });
        clearAccount();
        expect(getAccount()).toBeNull();
    });

    it('ignores damaged storage', () => {
        localStorage.setItem(ACCOUNT_KEY, '{nope');
        expect(getAccount()).toBeNull();
        localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ username: 'x' }));
        expect(getAccount()).toBeNull();
    });

    it('logs in and signs up, keeping the returned token', async () => {
        const fetch = vi.fn(async () => respond(200, { user: { id: 7, username: 'team' }, token: 'acct' }));
        const api = new ApiClient({ fetch });
        await login(api, 'team', 'pw');
        expect(getAccount()).toEqual({ id: 7, username: 'team', token: 'acct' });
        await register(api, 'team', 'pw', 'pw');
        const body = JSON.parse((fetch.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
        expect(body).toEqual({ username: 'team', password: 'pw', password_confirmation: 'pw' });
    });

    it('logs out locally even when the server cannot be reached', async () => {
        setAccount({ id: 1, username: 'team', token: 'acct' });
        const fetch = vi.fn(async () => {
            throw new TypeError('offline');
        });
        await logout(new ApiClient({ fetch }));
        expect(getAccount()).toBeNull();
        expect((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({ Authorization: 'Bearer acct' });
    });

    it('explains failures plainly', () => {
        expect(authErrorMessage('INVALID_CREDENTIALS')).toMatch(/don’t match/);
        expect(authErrorMessage('VALIDATION_FAILED', { username: ['That username is taken.'] })).toBe('That username is taken.');
        expect(authErrorMessage('REGISTRATION_CLOSED')).toMatch(/Ask your team/);
    });
});
