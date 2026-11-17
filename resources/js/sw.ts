/// <reference lib="webworker" />
// LLD §4.10 — app-shell service worker.
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, NetworkOnly } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

const manifest = self.__WB_MANIFEST;

// The shell cache is versioned by the build, so a new deploy gets a fresh copy.
function hash(input: string): string {
    let h = 5381;
    for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
}
const SHELL_CACHE = `shell-v${hash(JSON.stringify(manifest))}`;
const SHELL_URL = '/__shell';

precacheAndRoute(manifest);
cleanupOutdatedCaches();

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE).then(async (cache) => {
            const response = await fetch(SHELL_URL, { cache: 'reload', credentials: 'same-origin' });
            if (response.ok) await cache.put(SHELL_URL, response);
        }),
    );
    // A new SW waits. The page decides when it is safe to activate it (never mid-presentation).
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(keys.filter((k) => k.startsWith('shell-v') && k !== SHELL_CACHE).map((k) => caches.delete(k)));
            await self.clients.claim();
        })(),
    );
});

self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

// API and broadcasting traffic must never be served from cache.
registerRoute(({ url }) => url.pathname.startsWith('/api/') || url.pathname.startsWith('/broadcasting/'), new NetworkOnly());

const navigationStrategy = new NetworkFirst({ cacheName: SHELL_CACHE, networkTimeoutSeconds: 3 });
registerRoute(
    new NavigationRoute(async (options) => {
        try {
            const response = await navigationStrategy.handle(options);
            if (response && response.ok) return response;
        } catch {
            // fall through to the cached shell
        }
        const cached = await caches.match(SHELL_URL, { cacheName: SHELL_CACHE });
        return cached ?? Response.error();
    }, { denylist: [/^\/api\//, /^\/broadcasting\//, /^\/sw\.js$/, /^\/up$/] }),
);
