import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/main.ts'],
            refresh: true,
        }),
        vue({
            template: {
                transformAssetUrls: { base: null, includeAbsolute: false },
            },
        }),
        tailwindcss(),
        // LLD §4.10. The SW is built into public/build/sw.js and served at /sw.js by a Laravel route.
        VitePWA({
            strategies: 'injectManifest',
            srcDir: 'resources/js',
            filename: 'sw.ts',
            outDir: 'public/build',
            base: '/',
            scope: '/',
            injectRegister: null,
            manifestFilename: 'manifest.webmanifest',
            manifest: {
                id: '/',
                name: 'StageCue',
                short_name: 'StageCue',
                description: 'Presentation timer with remote messaging.',
                start_url: '/',
                scope: '/',
                display: 'standalone',
                display_override: ['window-controls-overlay', 'standalone'],
                background_color: '#000000',
                theme_color: '#000000',
                icons: [
                    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
                    { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ],
                shortcuts: [
                    { name: 'Display', url: '/display', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
                    { name: 'Controller', url: '/control', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
                ],
            },
            injectManifest: {
                globDirectory: 'public',
                globPatterns: ['build/**/*.{js,css,woff2,png,svg,webmanifest}', 'icons/*.png'],
                globIgnores: ['build/sw.js', 'build/manifest.json'],
            },
            devOptions: { enabled: false },
        }),
    ],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./resources/js', import.meta.url)),
        },
    },
    server: {
        watch: {
            ignored: ['**/storage/framework/views/**'],
        },
    },
});
