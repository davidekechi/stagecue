import { test as base, devices, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { setE2eAccount, type E2eAccount } from './helpers';

/**
 * Two isolated browser contexts: a laptop Display and a phone Controller.
 * Each has its own storage (IndexedDB, service worker), like two real devices.
 *
 * A24: every test gets a fresh account, and every browser context starts logged in to it (each with its own
 * login token, like two real devices). Tests that check the login screen itself use `loggedOut`.
 */
type Fixtures = { displayPage: Page; controllerPage: Page; account: E2eAccount; loggedOut: boolean };

export const ACCOUNT_KEY = 'stagecue.account';

export async function loginToken(request: APIRequestContext, account: E2eAccount) {
    const res = await request.post('/api/auth/login', { data: account, headers: { Accept: 'application/json' } });
    if (res.status() !== 200) throw new Error(`E2E login failed: ${res.status()} ${await res.text()}`);
    const body = (await res.json()) as { user: { id: number; email: string }; token: string };
    return { id: body.user.id, email: body.user.email, token: body.token };
}

/** Logs a browser context in before any page script runs (once per tab, so a test can still log out). */
export async function logIn(context: BrowserContext, request: APIRequestContext, account: E2eAccount) {
    const value = JSON.stringify(await loginToken(request, account));
    await context.addInitScript(
        ({ key, value }) => {
            try {
                if (sessionStorage.getItem('__e2e_seeded')) return;
                sessionStorage.setItem('__e2e_seeded', '1');
                localStorage.setItem(key, value);
            } catch {
                /* opaque origin (about:blank) */
            }
        },
        { key: ACCOUNT_KEY, value },
    );
}

export const test = base.extend<Fixtures>({
    loggedOut: [false, { option: true }],
    account: async ({ request }, use) => {
        const account = { email: `e2e-${randomUUID().slice(0, 12)}@example.test`, password: 'e2e-password' };
        const res = await request.post('/api/auth/register', { data: { ...account, password_confirmation: account.password }, headers: { Accept: 'application/json' } });
        if (res.status() !== 201) throw new Error(`E2E sign-up failed: ${res.status()} ${await res.text()}`);
        setE2eAccount(account);
        await use(account);
        setE2eAccount(null);
    },
    context: async ({ context, request, account, loggedOut }, use) => {
        if (!loggedOut) await logIn(context, request, account);
        await use(context);
    },
    displayPage: async ({ browser, request, account, loggedOut }, use) => {
        // Service workers are blocked here: these tests are about the realtime flow, and Playwright cannot
        // intercept requests from SW-controlled pages in WebKit. OFF-07 tests the service worker on its own.
        const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
        if (!loggedOut) await logIn(context, request, account);
        const page = await context.newPage();
        await use(page);
        await context.close();
    },
    controllerPage: async ({ browser, browserName, request, account, loggedOut }, use) => {
        const phone = browserName === 'webkit' ? devices['iPhone 13'] : devices['Pixel 7'];
        const { defaultBrowserType: _ignored, ...options } = phone;
        const context = await browser.newContext({ ...options, isMobile: browserName === 'firefox' ? false : options.isMobile, serviceWorkers: 'block' });
        if (!loggedOut) await logIn(context, request, account);
        const page = await context.newPage();
        await use(page);
        await context.close();
    },
});

export { expect } from '@playwright/test';
