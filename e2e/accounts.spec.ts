import { test, expect } from './fixtures';
import { openDisplay } from './helpers';
import type { Page } from '@playwright/test';

// A24 — email/password accounts. The Display and the phone must be logged in to the same account.

async function logInUi(page: Page, email: string, password: string) {
    await page.getByTestId('login-email').fill(email);
    await page.getByTestId('login-password').fill(password);
    await page.getByTestId('login-submit').click();
}

test.describe('logged out', () => {
    test.use({ loggedOut: true });

    test('ACC-01 log in on the display and the phone with the same account, pair and control', async ({ displayPage, controllerPage, request }) => {
        const email = `acc-${Date.now().toString(36)}@example.test`;
        const password = 'church-password';
        // Sign-up is hidden in the app (A24); the account is created the way an admin would, through the API.
        expect((await request.post('/api/auth/register', { data: { email, password, password_confirmation: password }, headers: { Accept: 'application/json' } })).status()).toBe(201);

        await displayPage.goto('/display');
        await expect(displayPage.getByTestId('login-view')).toBeVisible();
        await expect(displayPage.getByTestId('display-view')).toHaveCount(0);
        await logInUi(displayPage, email, password);
        await expect(displayPage).toHaveURL(/\/display$/);
        const code = (await displayPage.getByTestId('pairing-code').textContent({ timeout: 15_000 }))!.replace(/\s/g, '');

        await controllerPage.goto('/pair');
        await expect(controllerPage.getByTestId('login-view')).toBeVisible();
        await logInUi(controllerPage, email, 'wrong-password');
        await expect(controllerPage.getByTestId('login-error')).toContainText('don’t match');
        await logInUi(controllerPage, email, password);
        await expect(controllerPage.getByTestId('pair-view')).toBeVisible();
        await controllerPage.getByTestId('pair-name').fill('Phone');
        await controllerPage.getByTestId('pair-code').fill(code);
        await expect(controllerPage.getByTestId('badge-peer')).toHaveAttribute('data-state', 'connected', { timeout: 15_000 });
    });

    test('ACC-05 the sign-up page is hidden and its addresses go to Log in', async ({ page }) => {
        for (const path of ['/signup', '/register', '/login?mode=register']) {
            await page.goto(path);
            await expect(page).toHaveURL(/\/login$/);
            await expect(page.getByTestId('login-view')).toBeVisible();
            await expect(page.getByTestId('register-tab')).toHaveCount(0);
            await expect(page.getByTestId('login-confirm')).toHaveCount(0);
        }
        await page.goto('/');
        await expect(page.getByTestId('home-register')).toHaveCount(0);
    });

    test('ACC-02 the controller screen and home need a login', async ({ page }) => {
        await page.goto('/control');
        await expect(page).toHaveURL(/\/login\?next=(%2F|\/)control/);
        await page.goto('/');
        await expect(page.getByTestId('home-login')).toBeVisible();
        await expect(page.getByTestId('home-display')).toHaveCount(0);
    });
});

test('ACC-03 a phone on a different account cannot pair', async ({ displayPage, controllerPage, request }) => {
    const code = await openDisplay(displayPage);
    const other = { email: `other-${Date.now().toString(36)}@example.test`, password: 'other-password' };
    expect((await request.post('/api/auth/register', { data: { ...other, password_confirmation: other.password }, headers: { Accept: 'application/json' } })).status()).toBe(201);

    // Log the phone out of the test account, then in to the other one.
    await controllerPage.goto('/');
    await controllerPage.getByTestId('home-logout').click();
    await expect(controllerPage.getByTestId('home-login')).toBeVisible();
    await controllerPage.getByTestId('home-login').click();
    await logInUi(controllerPage, other.email, other.password);
    // Wait for the login to finish: navigating away mid-request cancels it (Firefox, WebKit).
    await expect(controllerPage.getByTestId('home-account')).toBeVisible();
    await controllerPage.goto('/pair');
    await controllerPage.getByTestId('pair-name').fill('Phone');
    await controllerPage.getByTestId('pair-code').fill(code);
    await expect(controllerPage.getByText('logged in to a different account')).toBeVisible();
    await expect(controllerPage.getByTestId('control-view')).toHaveCount(0);
    await expect(displayPage.getByTestId('pairing-code')).toBeVisible(); // the code is still usable
});

test('ACC-04 logging out unpairs the phone', async ({ displayPage, controllerPage }) => {
    const code = await openDisplay(displayPage);
    await controllerPage.goto('/pair');
    await controllerPage.getByTestId('pair-name').fill('Phone');
    await controllerPage.getByTestId('pair-code').fill(code);
    await expect(controllerPage.getByTestId('control-view')).toBeVisible({ timeout: 10_000 });

    await controllerPage.goto('/');
    await controllerPage.getByTestId('home-logout').click();
    await expect(controllerPage.getByTestId('home-login')).toBeVisible();
    // The Display notices the phone left and shows a fresh code.
    await expect(displayPage.getByTestId('pairing-code')).toBeVisible({ timeout: 15_000 });
});
