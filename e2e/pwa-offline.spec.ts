import { test, expect } from './fixtures';

// OFF-07: after a warm-up visit, /display loads with the network offline.
test('OFF-07 the display shell loads offline after a first visit', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Service worker offline emulation is reliable on Chromium only');

    await page.goto('/');
    await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.ready;
        return reg.active?.state;
    });
    // Make sure this page is controlled before going offline.
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    await context.setOffline(true);
    await page.goto('/display');
    await expect(page.getByTestId('display-view')).toBeAttached();
    await context.setOffline(false);
});
