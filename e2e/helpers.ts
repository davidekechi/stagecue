import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

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
    const res = await request.post('/api/pairings', { data: { code, deviceName }, headers: { Accept: 'application/json' } });
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
