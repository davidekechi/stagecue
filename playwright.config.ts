import { defineConfig, devices } from '@playwright/test';

const APP_PORT = Number(process.env.E2E_APP_PORT ?? 8123);
const REVERB_PORT = Number(process.env.E2E_REVERB_PORT ?? 8080);
const baseURL = `http://127.0.0.1:${APP_PORT}`;

export default defineConfig({
    testDir: './e2e',
    fullyParallel: false,
    workers: 1,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'list',
    use: {
        baseURL,
        trace: 'retain-on-failure',
        viewport: { width: 1280, height: 720 },
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 720 } } },
        { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 720 } } },
    ],
    webServer: [
        {
            command: `php artisan serve --host=127.0.0.1 --port=${APP_PORT}`,
            url: `${baseURL}/up`,
            reuseExistingServer: !process.env.CI,
            env: { REVERB_HOST: '127.0.0.1', REVERB_PORT: String(REVERB_PORT), APP_URL: baseURL },
            timeout: 60_000,
        },
        {
            command: `php artisan reverb:start --host=127.0.0.1 --port=${REVERB_PORT}`,
            port: REVERB_PORT,
            reuseExistingServer: !process.env.CI,
            timeout: 60_000,
        },
    ],
});
