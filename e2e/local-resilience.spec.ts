import { test, expect, type Page } from '@playwright/test';

// T4.6 — milestone gate: the laptop works as a complete standalone presentation timer.
const T = new Date('2026-11-18T10:00:00.000Z').getTime();

async function open(page: Page) {
    await page.goto('/display?dev=1');
    await expect(page.getByTestId('display-view')).toHaveAttribute('data-ready', 'true');
}
const timer = (page: Page) => page.getByTestId('stage-timer');
const local = (page: Page, name: string, payload: object = {}) =>
    page.evaluate(([n, p]) => (window as unknown as { __stagecue: { runtime: { local: (n: string, p: object) => Promise<unknown> } } }).__stagecue.runtime.local(n as string, p as object), [name, payload] as const);
const seconds = (text: string) => text.replace('+', '').split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
/** page.clock keeps flowing in real time between steps, so readouts are compared within ±1 s. */
async function expectNear(page: Page, expected: string) {
    await expect.poll(async () => Math.abs(seconds((await timer(page).textContent()) ?? '') - seconds(expected)), { timeout: 3_000 }).toBeLessThanOrEqual(1);
    expect((await timer(page).textContent())?.startsWith('+')).toBe(expected.startsWith('+'));
}

test.describe('local-only resilience', () => {
    test('OFF-05 reload while running + showing a message keeps the remaining time and the message expiry', async ({ page }) => {
        await page.clock.install({ time: T });
        await open(page);
        await local(page, 'TIMER_SET', { durationMs: 900_000 });
        await local(page, 'TIMER_START');
        await local(page, 'MESSAGE_SHOW', { id: '0193a3b4-8c2e-7d11-9f0a-aaaaaaaaaaaa', text: 'Seats please', mode: 'timed', durationMs: 60_000, corner: 'tr' });
        await page.clock.runFor(20_000);
        await expectNear(page, '14:40');

        await page.reload();
        await expect(page.getByTestId('display-view')).toHaveAttribute('data-ready', 'true');
        await expectNear(page, '14:40');
        await expect(page.getByTestId('stage-message')).toBeVisible();
        // The message keeps its ORIGINAL expiry (40 s left), it does not restart at 60 s.
        await page.clock.runFor(41_000);
        await expect(page.getByTestId('stage-message')).toHaveCount(0);
        await expect(timer(page)).toHaveAttribute('data-placement', 'center');
    });

    test('OFF-06 closed for 2 minutes, then reopened: overtime is correct', async ({ context }) => {
        const first = await context.newPage();
        await first.clock.install({ time: T });
        await open(first);
        await local(first, 'TIMER_SET', { durationMs: 60_000 });
        await local(first, 'TIMER_START');
        await local(first, 'MESSAGE_SHOW', { id: '0193a3b4-8c2e-7d11-9f0a-aaaaaaaaaaaa', text: 'Bye', mode: 'timed', durationMs: 90_000, corner: 'bl' });
        await first.close();

        const second = await context.newPage();
        await second.clock.install({ time: T + 3 * 60_000 }); // timer ended 2 min ago, message 1.5 min ago
        await open(second);
        await expect(second.getByTestId('stage-overtime')).toBeVisible();
        await expectNear(second, '+00:02:00');
        await expect(second.getByTestId('stage-message')).toHaveCount(0);
    });

    test('OFF-10 blackout + reload stays black; restore shows the correct state', async ({ page }) => {
        await page.clock.install({ time: T });
        await open(page);
        await local(page, 'TIMER_SET', { durationMs: 30_000 });
        await local(page, 'TIMER_START');
        await page.keyboard.press('b');
        await expect(page.getByTestId('stage-black')).toBeVisible();
        await page.clock.runFor(10_000);
        await page.reload();
        await expect(page.getByTestId('display-view')).toHaveAttribute('data-ready', 'true');
        await expect(page.getByTestId('stage')).toHaveAttribute('data-kind', 'black');
        await page.clock.runFor(30_000); // expiry happens during the blackout
        await expect(page.getByTestId('stage')).toHaveAttribute('data-kind', 'black');
        await page.keyboard.press('b');
        await expect(page.getByTestId('stage-overtime')).toBeVisible();
        await expectNear(page, '+00:00:10');
    });

    test('OFF-13 hidden for 10 minutes, then shown: the readout is correct within 1 s', async ({ page }) => {
        await page.clock.install({ time: T });
        await open(page);
        await local(page, 'TIMER_SET', { durationMs: 900_000 });
        await local(page, 'TIMER_START');
        await page.clock.fastForward(10 * 60_000); // timers are throttled/skipped while hidden
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await page.clock.runFor(1_000);
        await expectNear(page, '04:59');
    });

    test('OFF-14 a system clock change while running leaves the remaining time unaffected', async ({ page }) => {
        await page.clock.install({ time: T });
        await open(page);
        await local(page, 'TIMER_SET', { durationMs: 900_000 });
        await local(page, 'TIMER_START');
        await page.clock.runFor(60_000);
        await expectNear(page, '14:00');
        await page.clock.setSystemTime(T + 60_000 + 3 * 3600_000); // the wall clock jumps +3 h, monotonic time does not
        await page.clock.runFor(5_000);
        await expectNear(page, '13:55');
        await expect(page.getByTestId('stage-overtime')).toHaveCount(0);
        // And it survives a reload on the new timeline.
        await page.reload();
        await expect(page.getByTestId('display-view')).toHaveAttribute('data-ready', 'true');
        await expectNear(page, '13:55');
    });
});
