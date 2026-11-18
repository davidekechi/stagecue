import { createRouter, createWebHistory, createMemoryHistory, type RouteRecordRaw, type RouterHistory } from 'vue-router';
import { acquireDisplayLock, releaseDisplayLock } from './display/SingleTabLock';
import { useDisplayStore } from './stores/display';

export const routes: RouteRecordRaw[] = [
    { path: '/', name: 'home', component: () => import('./views/HomeView.vue') },
    {
        path: '/display',
        name: 'display',
        component: () => import('./views/DisplayView.vue'),
        // D14: only one authoritative Display tab per browser.
        beforeEnter: async () => {
            const store = useDisplayStore();
            store.lock = await acquireDisplayLock();
        },
    },
    { path: '/pair', name: 'pair', component: () => import('./views/PairView.vue') },
    {
        path: '/control',
        name: 'control',
        component: () => import('./views/ControlView.vue'),
        // Needs controller credentials, otherwise pair first.
        beforeEnter: async () => {
            try {
                const { getDb } = await import('./storage/db');
                const { DeviceRepo } = await import('./storage/DeviceRepo');
                const creds = await new DeviceRepo(await getDb(), 'controller').get();
                return creds ? true : { path: '/pair' };
            } catch {
                return { path: '/pair' };
            }
        },
    },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('./views/NotFoundView.vue') },
];

export function createAppRouter(history: RouterHistory = typeof window === 'undefined' ? createMemoryHistory() : createWebHistory()) {
    const router = createRouter({ history, routes });
    router.afterEach((to, from) => {
        if (from.name === 'display' && to.name !== 'display') {
            releaseDisplayLock();
            useDisplayStore().lock = 'pending';
        }
    });
    return router;
}
