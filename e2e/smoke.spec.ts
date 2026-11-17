import { test, expect } from './fixtures';

test('display and controller contexts load the app shell', async ({ displayPage, controllerPage }) => {
    await displayPage.goto('/display');
    await expect(displayPage.getByTestId('display-view')).toBeVisible();

    await controllerPage.goto('/pair');
    await expect(controllerPage.getByTestId('pair-view')).toBeVisible();
});
