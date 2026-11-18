import { test, expect } from './fixtures';

// T3.5 — local-only Display: every flow works with the keyboard + dev panel and no backend calls.
test.describe('local display (keyboard)', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/display?dev=1');
        await expect(page.getByTestId('display-view')).toHaveAttribute('data-ready', 'true');
    });

    test('the clock ticks with seconds; Tab sets 00:01 even over the clock, from any state', async ({ page }) => {
        const timer = page.getByTestId('stage-timer');
        await page.keyboard.press('c');
        await expect(timer).toHaveText(/^\d{2}:\d{2}:\d{2}\s?(AM|PM)$/);
        const first = await timer.textContent();
        await expect(timer).not.toHaveText(first!, { timeout: 2_500 }); // the seconds move

        await page.keyboard.press('Tab');
        await expect(timer).toHaveText('00:01');

        await page.getByTestId('dev-set-15m').click();
        await page.keyboard.press('Space');
        await expect(timer).toContainText('14:5', { timeout: 3_000 });
        await page.keyboard.press('Tab');
        await expect(timer).toHaveText('00:01');
        await expect(page.getByTestId('paused-indicator')).toBeVisible(); // set, not started
    });

    test('Space starts, pauses and resumes; B blacks out; D dismisses', async ({ page }) => {
        const timer = page.getByTestId('stage-timer');
        await page.getByTestId('dev-set-15m').click();
        await expect(timer).toContainText('15:00');
        await expect(page.getByTestId('paused-indicator')).toBeVisible();

        await page.keyboard.press('Space');
        await expect(timer).toContainText('14:5', { timeout: 3_000 });
        await expect(page.getByTestId('paused-indicator')).toHaveCount(0);

        await page.keyboard.press('Space');
        await expect(page.getByTestId('paused-indicator')).toBeVisible();
        const frozen = await timer.textContent();
        await page.waitForTimeout(1_500);
        await expect(timer).toHaveText(frozen!);

        await page.keyboard.press('Space');
        await expect(page.getByTestId('paused-indicator')).toHaveCount(0);

        await page.keyboard.press('b');
        await expect(page.getByTestId('stage-black')).toBeVisible();
        await expect(page.getByTestId('stage')).toHaveAttribute('data-kind', 'black');
        await page.keyboard.press('b');
        await expect(page.getByTestId('stage-black')).toHaveCount(0);

        await page.getByTestId('dev-msg-persistent').click();
        await expect(page.getByTestId('stage-message')).toBeVisible();
        await expect(timer).toHaveAttribute('data-placement', 'tr');
        await page.keyboard.press('d');
        await expect(page.getByTestId('stage-message')).toHaveCount(0);
        await expect(timer).toHaveAttribute('data-placement', 'center');
    });

    test('state survives a reload', async ({ page }) => {
        await page.getByTestId('dev-set-15m').click();
        await page.keyboard.press('Space');
        await page.keyboard.press('b');
        await expect(page.getByTestId('stage-black')).toBeVisible();
        await page.reload();
        await expect(page.getByTestId('stage')).toHaveAttribute('data-kind', 'black');
        await page.keyboard.press('b');
        await expect(page.getByTestId('stage-timer')).toContainText('14:5');
    });

    test('timer expiry shows TIME UP in red', async ({ page }) => {
        await page.getByTestId('dev-set-10s').click();
        await page.keyboard.press('Space');
        await expect(page.getByTestId('stage-overtime')).toBeVisible({ timeout: 13_000 });
        await expect(page.getByTestId('stage-overtime')).toContainText('TIME UP!');
        await expect(page.getByTestId('stage-timer')).toContainText(/\+00:00:0\d/);
    });
});
