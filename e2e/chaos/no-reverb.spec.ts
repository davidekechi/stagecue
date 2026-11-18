import { test, expect } from '../fixtures';
import { openDisplay, pairPhone } from '../helpers';
import { ChaosServers } from './servers';

// A22 — the app server is up but the real-time server never started (what a dev sees if they
// forget `reverb:start`). Pairing and unpairing still show up on both screens without a reload,
// the phone shows the last known state, and both say why commands are paused.
const servers = new ChaosServers(8153, 8119);
test.use({ baseURL: servers.baseURL });
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => servers.startApp());
test.afterAll(async () => servers.stopAll());

test('without Reverb: pair/unpair appear automatically, statuses explain, and it goes live once Reverb starts', async ({ displayPage, controllerPage }) => {
    test.setTimeout(120_000);
    const code = await openDisplay(displayPage);
    await expect(displayPage.getByTestId('pairing-link-down')).toBeVisible({ timeout: 10_000 });

    await controllerPage.goto('/pair');
    await controllerPage.getByTestId('pair-name').fill('Phone A');
    await controllerPage.getByTestId('pair-code').fill(code);
    await expect(controllerPage.getByTestId('control-view')).toBeVisible({ timeout: 10_000 });

    // No reloads anywhere from here on.
    await expect(displayPage.getByTestId('controller-connected')).toContainText('Paired with Phone A', { timeout: 10_000 });
    await expect(controllerPage.getByTestId('mirror-empty')).toHaveCount(0, { timeout: 10_000 }); // last known state shown
    await expect(controllerPage.getByTestId('mirror-tag')).toHaveText('Last known');
    await expect(controllerPage.getByTestId('link-notice')).toContainText('Still paired');

    // Reverb comes up → everything goes live by itself.
    await servers.startReverb();
    await expect(controllerPage.getByTestId('badge-peer')).toHaveAttribute('data-state', 'connected', { timeout: 60_000 });
    await expect(controllerPage.getByTestId('link-notice')).toHaveCount(0);
    await controllerPage.getByTestId('chip-5').click();
    await controllerPage.getByTestId('btn-display').click();
    await expect(displayPage.getByTestId('stage-timer')).toContainText('05:00', { timeout: 5_000 });

    // Kill Reverb again, then unpair from the display: the phone notices over HTTP.
    servers.killReverb();
    await displayPage.getByTestId('pairing-revoke').click();
    await displayPage.getByTestId('pairing-revoke').click();
    await expect(displayPage.getByTestId('controller-connected')).toHaveCount(0, { timeout: 5_000 });
    await expect(controllerPage.getByTestId('pair-reason')).toContainText('unpaired this phone', { timeout: 15_000 });
});

test('a reopened phone stays paired and reconnects with one tap', async ({ displayPage, controllerPage }) => {
    await servers.startReverb();
    const code = await openDisplay(displayPage);
    await pairPhone(controllerPage, code, 'Phone B');
    await controllerPage.goto('/'); // the app is closed and reopened
    await expect(controllerPage.getByTestId('home-reconnect')).toContainText('Reconnect to');
    await controllerPage.getByTestId('home-reconnect').click();
    await expect(controllerPage.getByTestId('badge-peer')).toHaveAttribute('data-state', 'connected', { timeout: 20_000 });
    await expect(displayPage.getByTestId('controller-connected')).toContainText('Paired with Phone B');
});
