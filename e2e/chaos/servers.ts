import { spawn, type ChildProcess } from 'node:child_process';

/** Laravel + Reverb on their own ports, so a test can kill and restart them mid-session. */
export class ChaosServers {
    private app: ChildProcess | null = null;
    private reverb: ChildProcess | null = null;

    constructor(
        readonly appPort = 8143,
        readonly reverbPort = 8109,
    ) {}

    get baseURL() {
        return `http://127.0.0.1:${this.appPort}`;
    }

    private env() {
        return {
            ...process.env,
            APP_URL: this.baseURL,
            DB_DATABASE: process.env.E2E_DB_DATABASE ?? 'stagecue_e2e',
            CACHE_PREFIX: 'stagecue-chaos-',
            STAGECUE_VITE_HOT_FILE: 'storage/framework/e2e-no-hot',
            BROADCAST_CONNECTION: 'reverb',
            REVERB_APP_ID: 'stagecue-chaos',
            REVERB_APP_KEY: 'stagecue-chaos-key',
            REVERB_APP_SECRET: 'stagecue-chaos-secret',
            REVERB_HOST: '127.0.0.1',
            REVERB_PORT: String(this.reverbPort),
            REVERB_SCHEME: 'http',
            STAGECUE_THROTTLE_SESSION_CREATE: '10000',
            STAGECUE_THROTTLE_PAIRING_MINUTE: '10000',
            STAGECUE_THROTTLE_PAIRING_HOUR: '10000',
            STAGECUE_THROTTLE_COMMANDS: '10000',
            STAGECUE_THROTTLE_SNAPSHOTS: '10000',
            STAGECUE_THROTTLE_HEARTBEAT: '10000',
        };
    }

    async startApp() {
        // detached → its own process group, so `php artisan serve` AND its `php -S` child die together.
        this.app = spawn('php', ['artisan', 'serve', '--no-reload', '--host=127.0.0.1', `--port=${this.appPort}`], { env: this.env(), detached: true, stdio: 'ignore' });
        await waitFor(`${this.baseURL}/up`);
    }

    async startReverb() {
        this.reverb = spawn('php', ['artisan', 'reverb:start', '--host=127.0.0.1', `--port=${this.reverbPort}`], { env: this.env(), detached: true, stdio: 'ignore' });
        await waitFor(`http://127.0.0.1:${this.reverbPort}`, true);
    }

    killApp() {
        kill(this.app);
        this.app = null;
    }

    killReverb() {
        kill(this.reverb);
        this.reverb = null;
    }

    async stopAll() {
        this.killApp();
        this.killReverb();
    }
}

function kill(p: ChildProcess | null) {
    if (!p?.pid) return;
    try {
        process.kill(-p.pid, 'SIGKILL');
    } catch {
        // already gone
    }
}

async function waitFor(url: string, anyResponse = false, timeoutMs = 30_000) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
        try {
            const r = await fetch(url);
            if (anyResponse || r.ok) return;
        } catch {
            // not up yet
        }
        await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`timed out waiting for ${url}`);
}
