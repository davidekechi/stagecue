import { createRouter, createWebHistory, createMemoryHistory, type RouteRecordRaw, type RouterHistory } from 'vue-router';

export const routes: RouteRecordRaw[] = [
    { path: '/', name: 'home', component: () => import('./views/HomeView.vue') },
    { path: '/display', name: 'display', component: () => import('./views/DisplayView.vue') },
    { path: '/pair', name: 'pair', component: () => import('./views/PairView.vue') },
    { path: '/control', name: 'control', component: () => import('./views/ControlView.vue') },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('./views/NotFoundView.vue') },
];

export function createAppRouter(history: RouterHistory = typeof window === 'undefined' ? createMemoryHistory() : createWebHistory()) {
    return createRouter({ history, routes });
}
