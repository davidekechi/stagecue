import { test, expect } from '@playwright/test';
import { openDisplay, pairByApi } from './helpers';

// M6 — a real round trip through Laravel + Reverb (WS-01/02/03), with an API-level controller.
test('the display pairs, receives relayed commands and publishes acked snapshots', async ({ page, request }) => {
    const code = await openDisplay(page);
    expect(code).toMatch(/^[2-9A-HJKMNP-Z]{6}$/);
    await expect(page.getByTestId('pairing-qr')).toBeVisible();

    const ctrl = await pairByApi(request, code, 'Playwright phone');
    await expect(page.getByTestId('controller-connected')).toContainText('Playwright phone', { timeout: 10_000 });
    // D11: the used code is replaced by a fresh one.
    await expect(page.getByTestId('pairing-code')).not.toHaveText(code.split('').join(''), { timeout: 10_000 });

    // WS-02: Controller command → Display.
    const set = await ctrl.send('TIMER_SET', { durationMs: 900_000 });
    expect(set.status).toBe(202);
    await expect(page.getByTestId('stage-timer')).toContainText('15:00', { timeout: 5_000 });
    expect((await ctrl.send('TIMER_START')).status).toBe(202);
    await expect(page.getByTestId('stage-timer')).toContainText('14:5', { timeout: 5_000 });

    // WS-03: the Display's snapshot (with the ack) reaches the server.
    await expect.poll(async () => (await ctrl.state()).snapshot?.revision ?? 0, { timeout: 5_000 }).toBeGreaterThanOrEqual(2);

    // FR-S7: a duplicate commandId has no effect.
    const blackout = await ctrl.send('BLACKOUT_ON');
    await expect(page.getByTestId('stage-black')).toBeVisible({ timeout: 5_000 });
    const revision = (await ctrl.state()).snapshot!.revision;
    const again = await ctrl.send('BLACKOUT_ON', {}, { commandId: blackout.commandId });
    expect(again.status).toBe(200);
    expect(again.body.duplicate).toBe(true);
    await page.waitForTimeout(500);
    expect((await ctrl.state()).snapshot!.revision).toBe(revision);

    // A message sent while blacked out stays hidden until restore (D8).
    await ctrl.send('MESSAGE_SHOW', { id: '0193a3b4-8c2e-7d11-9f0a-aaaaaaaaaaaa', text: 'Seats please', mode: 'persistent', corner: 'bl' });
    await page.waitForTimeout(500);
    await expect(page.getByTestId('stage-black')).toBeVisible();
    await ctrl.send('BLACKOUT_OFF');
    await expect(page.getByTestId('stage-message')).toContainText('Seats please', { timeout: 5_000 });
    await expect(page.getByTestId('stage-timer')).toHaveAttribute('data-placement', 'bl');
});

test('revoking the controller from the display invalidates its token', async ({ page, request }) => {
    const code = await openDisplay(page);
    const ctrl = await pairByApi(request, code);
    await expect(page.getByTestId('controller-connected')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('pairing-revoke').click();
    await page.getByTestId('pairing-revoke').click();
    await expect(page.getByTestId('controller-connected')).toHaveCount(0, { timeout: 5_000 });
    expect((await ctrl.send('TIMER_START')).status).toBe(401);
});

test('a reload resumes the same session', async ({ page, request }) => {
    const code = await openDisplay(page);
    const ctrl = await pairByApi(request, code);
    await expect(page.getByTestId('controller-connected')).toBeVisible({ timeout: 10_000 });
    await page.reload();
    await expect(page.getByTestId('controller-connected')).toBeVisible({ timeout: 10_000 });
    expect((await ctrl.send('BLACKOUT_ON')).status).toBe(202);
    await expect(page.getByTestId('stage-black')).toBeVisible({ timeout: 5_000 });
});
