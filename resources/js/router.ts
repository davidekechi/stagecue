import { createRouter, createWebHistory, createMemoryHistory, type RouteRecordRaw, type RouterHistory } from 'vue-router';
import { acquireDisplayLock, releaseDisplayLock } from './display/SingleTabLock';
import { useDisplayStore } from './stores/display';
import { getAccount, signupEnabled } from './account/account';

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
        path: '/login',
        name: 'login',
        component: () => import('./views/LoginView.vue'),
        // A24: while sign-up is hidden, the sign-up link lands on plain Log in.
        beforeEnter: (to) => {
            if (to.query.mode !== 'register' || signupEnabled()) return true;
            const { mode: _mode, ...query } = to.query;
            return { path: '/login', query, hash: to.hash };
        },
    },
    { path: '/signup', redirect: (to) => ({ path: '/login', query: signupEnabled() ? { ...to.query, mode: 'register' } : to.query }) },
    { path: '/register', redirect: '/signup' },
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

export const ACCOUNT_ROUTES = new Set(['display', 'pair', 'control']);

export function createAppRouter(history: RouterHistory = typeof window === 'undefined' ? createMemoryHistory() : createWebHistory()) {
    const router = createRouter({ history, routes });
    // A24: the Display, pairing and the Controller all need a logged-in account. A QR link keeps its #t= token.
    router.beforeEach((to) => {
        if (!ACCOUNT_ROUTES.has(String(to.name)) || getAccount()) return true;
        return { path: '/login', query: { next: to.fullPath } };
    });
    router.afterEach((to, from) => {
        if (from.name === 'display' && to.name !== 'display') {
            releaseDisplayLock();
            useDisplayStore().lock = 'pending';
        }
    });
    return router;
}
