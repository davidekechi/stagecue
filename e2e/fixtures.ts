import { test as base, devices, type Page } from '@playwright/test';

/**
 * Two isolated browser contexts: a laptop Display and a phone Controller.
 * Each has its own storage (IndexedDB, service worker), like two real devices.
 */
type Fixtures = { displayPage: Page; controllerPage: Page };

export const test = base.extend<Fixtures>({
    displayPage: async ({ browser }, use) => {
        const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        const page = await context.newPage();
        await use(page);
        await context.close();
    },
    controllerPage: async ({ browser, browserName }, use) => {
        const phone = browserName === 'webkit' ? devices['iPhone 13'] : devices['Pixel 7'];
        const { defaultBrowserType: _ignored, ...options } = phone;
        const context = await browser.newContext({ ...options, isMobile: browserName === 'firefox' ? false : options.isMobile });
        const page = await context.newPage();
        await use(page);
        await context.close();
    },
});

export { expect } from '@playwright/test';
