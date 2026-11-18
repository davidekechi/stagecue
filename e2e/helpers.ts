import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

export interface E2eAccount {
    username: string;
    password: string;
}

let e2eAccount: E2eAccount | null = null;
/** Set by the `account` fixture: the account this test's Display is logged in to. */
export function setE2eAccount(a: E2eAccount | null) {
    e2eAccount = a;
}

/** A fresh login token for this test's account (or another account, to test a mismatch). */
export async function accountToken(request: APIRequestContext, account: E2eAccount | null = e2eAccount): Promise<string> {
    if (!account) throw new Error('No E2E account: import test from ./fixtures');
    const res = await request.post('/api/auth/login', { data: account, headers: { Accept: 'application/json' } });
    expect(res.status()).toBe(200);
    return ((await res.json()) as { token: string }).token;
}

/** A UUIDv7-shaped id (the server only checks the UUID format). */
export function uuid7(): string {
    const hex = Date.now().toString(16).padStart(12, '0');
    const r = randomUUID().replace(/-/g, '');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${r.slice(13, 16)}-${'89ab'[parseInt(r[16]!, 16) % 4]}${r.slice(17, 20)}-${r.slice(20, 32)}`;
}

/** Opens the Display and waits until it has a session and shows a pairing code. */
export async function openDisplay(page: Page, query = '') {
    await page.goto(`/display${query}`);
    await expect(page.getByTestId('display-view')).toHaveAttribute('data-ready', 'true');
    const code = page.getByTestId('pairing-code');
    await expect(code).toBeVisible({ timeout: 15_000 });
    return (await code.textContent())!.replace(/\s/g, '');
}

/** Pairs an API-level controller (no UI) using the code shown on the Display. */
export async function pairByApi(request: APIRequestContext, code: string, deviceName = 'E2E phone') {
    const account = await accountToken(request);
    const res = await request.post('/api/pairings', { data: { code, deviceName }, headers: { Accept: 'application/json', Authorization: `Bearer ${account}` } });
    expect(res.status()).toBe(201);
    const body = await res.json();
    const sid: string = body.session.id;
    const token: string = body.token;
    const auth = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    return {
        sid,
        token,
        send: async (name: string, payload: object = {}, extra: { commandId?: string; baseRevision?: number | null } = {}) => {
            const commandId = extra.commandId ?? uuid7();
            const r = await request.post(`/api/sessions/${sid}/commands`, {
                headers: auth,
                data: { v: 1, commandId, name, baseRevision: extra.baseRevision ?? null, issuedAt: Date.now(), payload },
            });
            return { status: r.status(), body: await r.json(), commandId };
        },
        state: async () => (await (await request.get(`/api/sessions/${sid}/state`, { headers: auth })).json()) as { snapshot: { revision: number; state: Record<string, unknown> } | null },
    };
}

/** Pairs the phone UI with the code shown on the Display and waits for "Display connected". */
export async function pairPhone(phone: Page, code: string, name = 'Test phone') {
    await phone.goto('/pair');
    await phone.getByTestId('pair-name').fill(name);
    await phone.getByTestId('pair-code').fill(code);
    await expect(phone.getByTestId('control-view')).toBeVisible({ timeout: 10_000 });
    await expect(phone.getByTestId('badge-peer')).toHaveAttribute('data-state', 'connected', { timeout: 15_000 });
}

/** mm:ss / h:mm:ss / +hh:mm:ss → seconds. */
export function seconds(text: string): number {
    return text.trim().replace('+', '').split(/\s/)[0]!.split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
}

/** Holds the Black screen control for 800 ms. */
export async function holdBlackout(phone: Page) {
    const box = (await phone.getByTestId('hold-blackout').boundingBox())!;
    await phone.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await phone.mouse.down();
    await phone.waitForTimeout(800);
    await phone.mouse.up();
}

export const displayRevision = (display: Page) =>
    display.evaluate(() => (window as unknown as { __stagecue: { runtime: { state: { revision: number } } } }).__stagecue.runtime.state.revision);
