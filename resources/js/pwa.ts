/** Registers the service worker in production builds only (LLD §4.10). */
export function registerServiceWorker(): void {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error: unknown) => {
            console.warn('[stagecue] service worker registration failed', error);
        });
    });
}
