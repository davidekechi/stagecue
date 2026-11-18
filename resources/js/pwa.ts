// LLD §4.10 — service worker registration and the SAFE update flow.
// A new version installs in the background and WAITS. It is only activated (with a reload):
//  - on the Display: when the technician presses "Apply" in the SetupPanel, which is only
//    possible while no timer is running and no message is showing;
//  - on the Controller: automatically, when the app is in the background and nothing is pending.
import { ref, type Ref } from 'vue';

type SWLike = Pick<ServiceWorker, 'postMessage' | 'state' | 'addEventListener'>;
type RegistrationLike = {
    waiting: SWLike | null;
    installing: SWLike | null;
    addEventListener(type: 'updatefound', fn: () => void): void;
    update?(): Promise<unknown>;
};
type ContainerLike = {
    controller: unknown;
    register(url: string, opts: { scope: string }): Promise<RegistrationLike>;
    addEventListener(type: 'controllerchange', fn: () => void): void;
};

/** True when a new version is installed and waiting to be applied. */
export const updateAvailable: Ref<boolean> = ref(false);

let registration: RegistrationLike | null = null;
let reloadOnChange = false;

export interface UpdateDeps {
    container?: ContainerLike | null;
    reload?: () => void;
    prod?: boolean;
}

/** Registers the SW and watches for waiting updates. Returns the registration (or null). */
export async function registerServiceWorker(deps: UpdateDeps = {}): Promise<RegistrationLike | null> {
    const container = deps.container !== undefined ? deps.container : ((globalThis.navigator as unknown as { serviceWorker?: ContainerLike })?.serviceWorker ?? null);
    if (!(deps.prod ?? import.meta.env.PROD) || !container) return null;
    const reload = deps.reload ?? (() => globalThis.location.reload());
    try {
        const reg = await container.register('/sw.js', { scope: '/' });
        registration = reg;
        // An update that finished installing while the page was closed.
        if (reg.waiting && container.controller) updateAvailable.value = true;
        reg.addEventListener('updatefound', () => {
            const sw = reg.installing;
            sw?.addEventListener('statechange', () => {
                // `installed` with an existing controller = an update (not the first install).
                if (sw.state === 'installed' && container.controller) updateAvailable.value = true;
            });
        });
        container.addEventListener('controllerchange', () => {
            if (reloadOnChange) reload();
        });
        return reg;
    } catch (error) {
        console.warn('[stagecue] service worker registration failed', error);
        return null;
    }
}

/** Activates the waiting version and reloads once it has taken control. */
export function applyUpdate(): boolean {
    const waiting = registration?.waiting;
    if (!waiting) return false;
    reloadOnChange = true;
    waiting.postMessage({ type: 'SKIP_WAITING' });
    return true;
}

/** Display rule: never interrupt a running timer or a visible message. */
export function displayCanUpdate(state: { timer: { status: string }; message: { status: string } } | null): boolean {
    if (!state) return true;
    return !['running', 'overtime'].includes(state.timer.status) && state.message.status !== 'showing';
}

/** Test hook. */
export function resetUpdateState(): void {
    updateAvailable.value = false;
    registration = null;
    reloadOnChange = false;
}
