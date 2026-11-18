import { defineConfig, devices } from '@playwright/test';

const APP_PORT = Number(process.env.E2E_APP_PORT ?? 8133);
const REVERB_PORT = Number(process.env.E2E_REVERB_PORT ?? 8099);
const baseURL = `http://127.0.0.1:${APP_PORT}`;

/** Both servers get the same Reverb credentials; rate limits are raised for the suite. */
const serverEnv = {
    APP_URL: baseURL,
    // Never share the developer's database or cache (rate-limit counters live there).
    DB_DATABASE: process.env.E2E_DB_DATABASE ?? 'stagecue_e2e',
    CACHE_PREFIX: 'stagecue-e2e-',
    // Always the production build (and its CSP), even while a developer runs `npm run dev`.
    STAGECUE_VITE_HOT_FILE: 'storage/framework/e2e-no-hot',
    BROADCAST_CONNECTION: 'reverb',
    REVERB_APP_ID: 'stagecue-e2e',
    REVERB_APP_KEY: 'stagecue-e2e-key',
    REVERB_APP_SECRET: 'stagecue-e2e-secret',
    REVERB_HOST: '127.0.0.1',
    REVERB_PORT: String(REVERB_PORT),
    REVERB_SCHEME: 'http',
    STAGECUE_THROTTLE_SESSION_CREATE: '10000',
    STAGECUE_THROTTLE_PAIRING_MINUTE: '10000',
    STAGECUE_THROTTLE_PAIRING_HOUR: '10000',
    STAGECUE_THROTTLE_COMMANDS: '10000',
    STAGECUE_THROTTLE_SNAPSHOTS: '10000',
    STAGECUE_THROTTLE_HEARTBEAT: '10000',
    STAGECUE_THROTTLE_LOGIN: '10000',
    STAGECUE_THROTTLE_REGISTER: '10000',
};

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
            // --no-reload passes the environment through to the PHP server process.
            command: `php artisan migrate:fresh --force --no-interaction && php artisan serve --no-reload --host=127.0.0.1 --port=${APP_PORT}`,
            url: `${baseURL}/up`,
            reuseExistingServer: false,
            env: serverEnv,
            timeout: 60_000,
        },
        {
            command: `php artisan reverb:start --host=127.0.0.1 --port=${REVERB_PORT}`,
            port: REVERB_PORT,
            reuseExistingServer: false,
            env: serverEnv,
            timeout: 60_000,
        },
    ],
});
