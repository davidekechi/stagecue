import { test, expect } from './fixtures';

// E2E-17: a second /display tab in the same browser shows "already open".
test('E2E-17 second display tab is refused', async ({ context }) => {
    const first = await context.newPage();
    await first.goto('/display');
    await expect(first.getByTestId('display-view')).toHaveAttribute('data-ready', 'true');

    const second = await context.newPage();
    await second.goto('/display');
    await expect(second.getByTestId('display-busy')).toContainText('already open in another window');

    await first.close();
    await second.reload();
    await expect(second.getByTestId('display-view')).toHaveAttribute('data-ready', 'true');
});

test('the setup panel is visible outside fullscreen and holds no stage content', async ({ page }) => {
    await page.goto('/display');
    await expect(page.getByTestId('setup-panel')).toBeVisible();
    await page.getByTestId('setup-collapse').click();
    await expect(page.getByTestId('setup-panel')).toHaveCount(0);
    await page.getByTestId('setup-expand').click();
    await expect(page.getByTestId('setup-panel')).toBeVisible();
});
