import { test, expect } from '../fixtures';
import { displayRevision, openDisplay, pairPhone, seconds } from '../helpers';
import { ChaosServers } from './servers';

// T8.4 — OFF-04 / WS-07: kill Reverb and PHP mid-session; latency; concurrent tabs.
const servers = new ChaosServers();
test.use({ baseURL: servers.baseURL });
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
    await servers.startApp();
    await servers.startReverb();
});
test.afterAll(async () => servers.stopAll());

test('OFF-04 + WS-07: kill Reverb and PHP mid-session; the display carries on; both recover', async ({ displayPage, controllerPage }) => {
    test.setTimeout(120_000);
    const code = await openDisplay(displayPage);
    await pairPhone(controllerPage, code);
    await controllerPage.getByTestId('chip-15').click();
    await controllerPage.getByTestId('btn-display-start').click();
    await expect(controllerPage.getByTestId('btn-pause')).toBeVisible({ timeout: 8_000 });

    servers.killReverb();
    servers.killApp();
    const timer = displayPage.getByTestId('stage-timer');
    const a = seconds((await timer.textContent())!);
    await displayPage.waitForTimeout(3_000);
    expect(seconds((await timer.textContent())!)).toBeLessThanOrEqual(a - 2); // the presentation never noticed
    await expect(controllerPage.getByTestId('badge-server')).toContainText('offline', { timeout: 15_000 });
    await expect(controllerPage.getByTestId('btn-pause')).toBeDisabled();

    await servers.startApp();
    await servers.startReverb();
    // pusher-js reconnects on its own; Echo re-subscribes; the controller resyncs.
    await expect(controllerPage.getByTestId('badge-peer')).toHaveAttribute('data-state', 'connected', { timeout: 60_000 });
    await expect(displayPage.getByTestId('badge-server')).toContainText('online', { timeout: 30_000 });
    await controllerPage.getByTestId('btn-pause').click();
    await expect(displayPage.getByTestId('paused-indicator')).toBeVisible({ timeout: 10_000 });
});

test('a 2 s delay on the snapshot POST still confirms, in order', async ({ displayPage, controllerPage }) => {
    const code = await openDisplay(displayPage);
    await pairPhone(controllerPage, code);
    await displayPage.route('**/api/sessions/*/snapshots', async (r) => {
        await new Promise((res) => setTimeout(res, 2_000));
        await r.continue();
    });
    await controllerPage.getByTestId('chip-5').click();
    await controllerPage.getByTestId('btn-display').click();
    await expect(displayPage.getByTestId('stage-timer')).toContainText('05:00', { timeout: 5_000 }); // the display is immediate
    await expect(controllerPage.getByTestId('btn-start')).toBeVisible({ timeout: 10_000 }); // the phone learns 2 s later
    await controllerPage.getByTestId('btn-start').click();
    await expect(controllerPage.getByTestId('btn-pause')).toBeVisible({ timeout: 10_000 });
    await displayPage.unroute('**/api/sessions/*/snapshots');
});

test('concurrent commands from two tabs of the same controller give one consistent outcome', async ({ displayPage, controllerPage }) => {
    const code = await openDisplay(displayPage, '?dev=1');
    await pairPhone(controllerPage, code);
    await controllerPage.getByTestId('chip-10').click();
    await controllerPage.getByTestId('btn-display').click();
    await expect(controllerPage.getByTestId('btn-start')).toBeVisible({ timeout: 5_000 });

    const second = await controllerPage.context().newPage();
    await second.goto('/control');
    await expect(second.getByTestId('badge-peer')).toHaveAttribute('data-state', 'connected', { timeout: 20_000 });
    const before = await displayRevision(displayPage);
    await Promise.all([controllerPage.getByTestId('btn-start').click(), second.getByTestId('btn-start').click()]);

    // One START applies, the other is refused (INVALID_STATE) — never two timers, never a reset.
    await expect(displayPage.getByTestId('stage-timer')).toContainText('09:5', { timeout: 5_000 });
    await displayPage.waitForTimeout(1_500);
    expect(await displayRevision(displayPage)).toBe(before + 1);
    for (const p of [controllerPage, second]) await expect(p.getByTestId('btn-pause')).toBeVisible({ timeout: 10_000 });
    await second.close();
});
