import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { createAppRouter } from './router';
import { registerServiceWorker } from './pwa';
import '../css/app.css';

const app = createApp(App);
app.use(createPinia());
app.use(createAppRouter());
app.mount('#app');

window.addEventListener('load', () => void registerServiceWorker());

// iOS Safari ignores `user-scalable=no` for pinch: stop pinch-zoom directly (double-tap is handled in CSS).
for (const type of ['gesturestart', 'gesturechange']) document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
