import { test, expect } from '../fixtures';
import { displayRevision, holdBlackout, openDisplay, pairPhone, seconds } from '../helpers';
import type { Page } from '@playwright/test';

// T8.3 — OFF-01…OFF-12 against the full stack (Laravel + Reverb + two browsers).
const timer = (p: Page) => p.getByTestId('stage-timer').first();
const mirrorTimer = (phone: Page) => phone.getByTestId('live-mirror').getByTestId('stage-timer');

async function startTimer(phone: Page, display: Page, chip = 'chip-15') {
    await phone.getByTestId(chip).click();
    await phone.getByTestId('btn-display-start').click();
    await expect(timer(display)).not.toHaveText(/^15:00/, { timeout: 8_000 });
    // …and the phone has seen it too (its mirror drives the buttons).
    await expect(phone.getByTestId('btn-pause')).toBeVisible({ timeout: 8_000 });
}

test('OFF-01/03 + WS-05: the controller drops offline mid-countdown, the display carries on, then it resyncs', async ({ displayPage, controllerPage }) => {
    const code = await openDisplay(displayPage);
    await pairPhone(controllerPage, code);
    await startTimer(controllerPage, displayPage);

    await controllerPage.context().setOffline(true);
    await expect(controllerPage.getByTestId('badge-server')).toContainText('offline', { timeout: 5_000 });
    await expect(controllerPage.getByTestId('btn-pause')).toBeDisabled();
    await expect(controllerPage.getByTestId('msg-draft')).toBeVisible();
    await expect(controllerPage.getByTestId('hold-blackout')).toBeDisabled();

    const a = seconds((await timer(displayPage).textContent())!);
    await displayPage.waitForTimeout(2_100);
    expect(seconds((await timer(displayPage).textContent())!)).toBeLessThan(a); // still counting
    // OFF-03: the display's setup panel notices the controller is gone (whisper heartbeat: 9 s).
    await expect(displayPage.getByTestId('badge-peer')).not.toHaveAttribute('data-state', 'connected', { timeout: 15_000 });

    await controllerPage.context().setOffline(false);
    await controllerPage.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(controllerPage.getByTestId('badge-peer')).toHaveAttribute('data-state', 'connected', { timeout: 20_000 });
    await expect(controllerPage.getByTestId('mirror-tag')).toHaveText('Live');
    expect(Math.abs(seconds((await mirrorTimer(controllerPage).textContent())!) - seconds((await timer(displayPage).textContent())!))).toBeLessThanOrEqual(1);
    await expect(displayPage.getByTestId('badge-peer')).toHaveAttribute('data-state', 'connected', { timeout: 15_000 });
});

test('OFF-02/08: the display goes offline; the message expires on time, overtime starts, blackout holds', async ({ displayPage, controllerPage }) => {
    const code = await openDisplay(displayPage);
    await pairPhone(controllerPage, code);
    // An 8-second timer and a 3-second message.
    await controllerPage.getByTestId('dur-m-down').click({ clickCount: 15 });
    await controllerPage.getByTestId('dur-s-up').click({ clickCount: 8 });
    await controllerPage.getByTestId('btn-display-start').click();
    // START is only sent after the Display confirms the SET: make sure it is running before the
    // Display goes offline (an offline Display cannot receive commands — that is the point).
    await expect(controllerPage.getByTestId('btn-pause')).toBeVisible({ timeout: 10_000 });
    await controllerPage.getByTestId('msg-text').fill('Back in a moment');
    await controllerPage.getByTestId('msgdur-custom').click();
    await controllerPage.getByTestId('msgdur-custom-input').fill('3');
    await controllerPage.getByTestId('msg-send').click();
    await expect(displayPage.getByTestId('stage-message')).toBeVisible({ timeout: 5_000 });

    await displayPage.context().setOffline(true);
    await expect(displayPage.getByTestId('stage-message')).toHaveCount(0, { timeout: 5_000 }); // FR-M5
    await expect(displayPage.getByTestId('stage-overtime')).toBeVisible({ timeout: 10_000 }); // FR-T10
    await expect(timer(displayPage)).toHaveText(/^\+00:00:0\d/);

    // OFF-08: blackout from the keyboard while offline stays black.
    await displayPage.keyboard.press('b');
    await expect(displayPage.getByTestId('stage-black')).toBeVisible();
    await displayPage.waitForTimeout(1_500);
    await expect(displayPage.getByTestId('stage-black')).toBeVisible();
    await displayPage.context().setOffline(false);
});

test('OFF-09: blackout, then the controller disconnects; it stays black and the phone shows it on reconnect', async ({ displayPage, controllerPage }) => {
    const code = await openDisplay(displayPage);
    await pairPhone(controllerPage, code);
    await holdBlackout(controllerPage);
    await expect(displayPage.getByTestId('stage-black')).toBeVisible({ timeout: 5_000 });

    await controllerPage.context().setOffline(true);
    await displayPage.waitForTimeout(2_000);
    await expect(displayPage.getByTestId('stage-black')).toBeVisible();

    // …then the phone comes back and the app is opened again.
    await controllerPage.context().setOffline(false);
    await controllerPage.goto('/control');
    await expect(controllerPage.getByTestId('badge-peer')).toHaveAttribute('data-state', 'connected', { timeout: 20_000 });
    await expect(controllerPage.getByTestId('mirror-blackout')).toBeVisible();
    await expect(controllerPage.getByTestId('restore')).toBeVisible();
});

test('OFF-11: a message composed offline is a draft, and is not sent on reconnect until "Send now"', async ({ displayPage, controllerPage }) => {
    const code = await openDisplay(displayPage);
    await pairPhone(controllerPage, code);
    await controllerPage.context().setOffline(true);
    await expect(controllerPage.getByTestId('msg-draft')).toBeVisible({ timeout: 5_000 });
    await controllerPage.getByTestId('msg-text').fill('Drafted while offline');
    await controllerPage.getByTestId('msg-draft').click();
    await expect(controllerPage.getByTestId('draft')).toHaveCount(1);

    await controllerPage.context().setOffline(false);
    await controllerPage.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(controllerPage.getByTestId('badge-peer')).toHaveAttribute('data-state', 'connected', { timeout: 20_000 });
    await displayPage.waitForTimeout(2_000);
    await expect(displayPage.getByTestId('stage-message')).toHaveCount(0); // never auto-replayed

    await controllerPage.getByTestId('draft-send').click();
    await expect(displayPage.getByTestId('stage-message')).toContainText('Drafted while offline', { timeout: 5_000 });
    await expect(controllerPage.getByTestId('draft')).toHaveCount(0, { timeout: 5_000 });
});

test('OFF-12: a lost ack shows "not confirmed"; Retry is applied once', async ({ displayPage, controllerPage }) => {
    const code = await openDisplay(displayPage, '?dev=1');
    await pairPhone(controllerPage, code);
    await controllerPage.getByTestId('chip-5').click();
    await controllerPage.getByTestId('btn-display').click();
    await expect(controllerPage.getByTestId('btn-start')).toBeVisible({ timeout: 5_000 });
    const before = await displayRevision(displayPage);

    // The display applies the command but its snapshot (carrying the ack) cannot get out.
    await displayPage.route('**/api/sessions/*/snapshots', (r) => r.abort());
    await controllerPage.getByTestId('btn-start').click();
    await expect(timer(displayPage)).toContainText('04:5', { timeout: 5_000 });
    await expect(controllerPage.getByTestId('btn-start-status')).toHaveText('Not confirmed by the display.', { timeout: 6_000 });
    await controllerPage.getByTestId('btn-start-retry').click(); // same commandId → DUPLICATE on the display
    await displayPage.unroute('**/api/sessions/*/snapshots');

    await expect(controllerPage.getByTestId('btn-pause')).toBeVisible({ timeout: 20_000 });
    expect(await displayRevision(displayPage)).toBe(before + 1); // applied exactly once
});

test('E2E-16 STALE_VIEW: the display changed unseen; a destructive command is refused, then confirmed again', async ({ displayPage, controllerPage }) => {
    const code = await openDisplay(displayPage);
    await pairPhone(controllerPage, code);
    await controllerPage.getByTestId('chip-10').click();
    await controllerPage.getByTestId('btn-display').click();
    await expect(controllerPage.getByTestId('btn-start')).toBeVisible({ timeout: 5_000 });

    // The technician starts the timer on the laptop while the phone can't see it.
    await displayPage.route('**/api/sessions/*/snapshots', (r) => r.abort());
    await displayPage.keyboard.press('Space');
    await expect(timer(displayPage)).toContainText('09:5', { timeout: 5_000 });

    await controllerPage.getByTestId('btn-clear').click(); // based on the old "ready" view
    await displayPage.waitForTimeout(500);
    await displayPage.unroute('**/api/sessions/*/snapshots');

    await expect(controllerPage.getByTestId('conflict-sheet')).toBeVisible({ timeout: 20_000 });
    await expect(timer(displayPage)).toContainText('09:'); // nothing was cleared
    await controllerPage.getByTestId('conflict-confirm').click();
    await expect(displayPage.getByTestId('stage')).toHaveAttribute('data-kind', 'standby', { timeout: 5_000 });
});
