import { test, expect, logIn } from './fixtures';
import { openDisplay, pairPhone } from './helpers';
import { devices } from '@playwright/test';

// A28 — several phones paired with one Display; any of them can control it, and one can be removed.
test('MC-01 two phones control one display; unpairing one leaves the other working', async ({ browser, browserName, displayPage, controllerPage, request, account }) => {
    const firstCode = await openDisplay(displayPage);
    await pairPhone(controllerPage, firstCode, 'Phone A');

    // The display offers a fresh code for another phone straight away.
    const codeEl = displayPage.getByTestId('pairing-code');
    await expect(codeEl).not.toHaveText(firstCode.split('').join(''), { timeout: 10_000 });
    const secondCode = (await codeEl.textContent())!.replace(/\s/g, '');
    expect(secondCode).not.toBe(firstCode);

    const phone = browserName === 'webkit' ? devices['iPhone 13'] : devices['Pixel 7'];
    const { defaultBrowserType: _ignored, ...options } = phone;
    const ctxB = await browser.newContext({ ...options, isMobile: browserName === 'firefox' ? false : options.isMobile, serviceWorkers: 'block' });
    await logIn(ctxB, request, account);
    const phoneB = await ctxB.newPage();
    await pairPhone(phoneB, secondCode, 'Phone B');

    // Both are listed, both online, and the first is still paired.
    const items = displayPage.getByTestId('controller-item');
    await expect(displayPage.getByTestId('controller-connected')).toContainText('Paired with 2 phones', { timeout: 10_000 });
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toHaveAttribute('data-online', 'true', { timeout: 10_000 });
    await expect(items.nth(1)).toHaveAttribute('data-online', 'true', { timeout: 10_000 });
    await expect(phoneB.getByTestId('control-phones')).toContainText('2 phones');

    // Either phone can control the display.
    await controllerPage.getByTestId('chip-5').click();
    await controllerPage.getByTestId('btn-display').click();
    await expect(displayPage.getByTestId('stage-timer')).toContainText('05:00', { timeout: 5_000 });
    await phoneB.getByTestId('chip-10').click();
    await phoneB.getByTestId('btn-display').click();
    await expect(displayPage.getByTestId('stage-timer')).toContainText('10:00', { timeout: 5_000 });

    // Unpair Phone A on the display: it is told, Phone B keeps working.
    const a = items.filter({ hasText: 'Phone A' });
    await a.getByTestId('pairing-revoke-one').click();
    await a.getByTestId('pairing-revoke-one').click();
    await expect(controllerPage.getByTestId('pair-reason')).toContainText('unpaired this phone', { timeout: 15_000 });
    await expect(items).toHaveCount(1);
    await expect(displayPage.getByTestId('controller-connected')).toContainText('Paired with Phone B');
    await phoneB.getByTestId('chip-15').click();
    await phoneB.getByTestId('btn-display').click();
    await expect(displayPage.getByTestId('stage-timer')).toContainText('15:00', { timeout: 5_000 });

    await ctxB.close();
});
