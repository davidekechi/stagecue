import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: { '@': fileURLToPath(new URL('./resources/js', import.meta.url)) },
    },
    test: {
        environment: 'happy-dom',
        include: ['resources/js/**/__tests__/**/*.spec.ts'],
        setupFiles: ['resources/js/__tests__/setup.ts'],
        restoreMocks: true,
        coverage: {
            provider: 'v8',
            include: ['resources/js/**/*.{ts,vue}'],
            exclude: ['resources/js/**/__tests__/**', 'resources/js/sw.ts', 'resources/js/main.ts', 'resources/js/env.d.ts'],
            reporter: ['text-summary', 'html', 'lcov'],
            thresholds: {
                // NFR-9 / 05 §1: the pure core must stay at ≥ 90% lines and branches.
                'resources/js/core/**': { lines: 90, branches: 90, functions: 90, statements: 90 },
            },
        },
    },
});
