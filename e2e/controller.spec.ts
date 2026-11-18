import { test, expect } from './fixtures';
import { holdBlackout, openDisplay, pairPhone } from './helpers';

test('E2E-01/02/04 pair by code, display the timer, start it, send a message', async ({ displayPage, controllerPage }) => {
    const code = await openDisplay(displayPage);
    await pairPhone(controllerPage, code, 'Stage phone');
    await expect(displayPage.getByTestId('controller-connected')).toContainText('Stage phone');

    // E2E-02: Display Timer without starting → 15:00, paused.
    await controllerPage.getByTestId('chip-15').click();
    await controllerPage.getByTestId('btn-display').click();
    await expect(displayPage.getByTestId('stage-timer')).toContainText('15:00', { timeout: 5_000 });
    await expect(displayPage.getByTestId('paused-indicator')).toBeVisible();
    await expect(controllerPage.getByTestId('btn-start')).toBeVisible();

    // E2E-01: Start → the display counts down; the mirror matches ±1 s.
    await controllerPage.getByTestId('btn-start').click();
    await expect(displayPage.getByTestId('stage-timer')).toContainText('14:5', { timeout: 5_000 });
    const d = (await displayPage.getByTestId('stage-timer').textContent())!;
    const m = (await controllerPage.getByTestId('live-mirror').getByTestId('stage-timer').textContent())!;
    const secs = (t: string) => t.trim().slice(0, 5).split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
    expect(Math.abs(secs(d) - secs(m))).toBeLessThanOrEqual(1);
    await expect(controllerPage.getByTestId('mirror-tag')).toHaveText('Live');

    // E2E-04: a message, into the bottom-left corner.
    await controllerPage.getByTestId('msg-text').fill('Please take your seats');
    await controllerPage.getByTestId('corner-bl').click();
    await controllerPage.getByTestId('msg-send').click();
    await expect(displayPage.getByTestId('stage-message')).toContainText('Please take your seats', { timeout: 5_000 });
    await expect(displayPage.getByTestId('stage-timer')).toHaveAttribute('data-placement', 'bl');
    await expect(controllerPage.getByTestId('msg-send')).toHaveAttribute('data-status', 'confirmed');
});

test('E2E-11 hold for black screen, then restore', async ({ displayPage, controllerPage }) => {
    const code = await openDisplay(displayPage);
    await pairPhone(controllerPage, code);
    const hold = controllerPage.getByTestId('hold-blackout');
    // A tap is not enough.
    await hold.click();
    await controllerPage.waitForTimeout(800);
    await expect(displayPage.getByTestId('stage-black')).toHaveCount(0);
    // A 600 ms hold is.
    await holdBlackout(controllerPage);
    await expect(displayPage.getByTestId('stage-black')).toBeVisible({ timeout: 5_000 });
    await expect(controllerPage.getByTestId('mirror-blackout')).toBeVisible();
    await controllerPage.getByTestId('restore').click();
    await expect(displayPage.getByTestId('stage-black')).toHaveCount(0, { timeout: 5_000 });
});

test('E2E-18 revoking the controller from the display sends the phone to /pair', async ({ displayPage, controllerPage }) => {
    const code = await openDisplay(displayPage);
    await pairPhone(controllerPage, code);
    await displayPage.getByTestId('pairing-revoke').click();
    await displayPage.getByTestId('pairing-revoke').click();
    await expect(controllerPage.getByTestId('pair-view')).toBeVisible({ timeout: 10_000 });
    await expect(controllerPage.getByTestId('pair-reason')).toContainText('unpaired this phone');
});

test('unpair from the phone', async ({ displayPage, controllerPage }) => {
    const code = await openDisplay(displayPage);
    await pairPhone(controllerPage, code);
    await controllerPage.getByTestId('control-menu').click();
    await controllerPage.getByTestId('control-unpair').click();
    await expect(controllerPage.getByTestId('pair-view')).toBeVisible();
    await expect(displayPage.getByTestId('controller-connected')).toHaveCount(0, { timeout: 10_000 });
});

test('A23 the phone shows the time of day; it moves to the corner with a message, like the timer', async ({ displayPage, controllerPage }) => {
    const code = await openDisplay(displayPage);
    await pairPhone(controllerPage, code);
    await controllerPage.getByTestId('clock-toggle').click();
    await expect(displayPage.getByTestId('stage')).toHaveAttribute('data-kind', 'clock', { timeout: 5_000 });
    await expect(displayPage.getByTestId('stage-timer')).toHaveText(/^\d{1,2}:\d{2} (AM|PM)$/);
    await expect(controllerPage.getByTestId('clock-toggle')).toHaveAttribute('aria-checked', 'true', { timeout: 5_000 });

    await controllerPage.getByTestId('msg-text').fill('Lunch is served');
    await controllerPage.getByTestId('corner-bl').click();
    await controllerPage.getByTestId('msg-send').click();
    await expect(displayPage.getByTestId('stage-message')).toBeVisible({ timeout: 5_000 });
    await expect(displayPage.getByTestId('stage-timer')).toHaveAttribute('data-placement', 'bl');
    await expect(displayPage.getByTestId('stage-timer')).toHaveText(/(AM|PM)$/);
});
