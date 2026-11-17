import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import globals from 'globals';

export default tseslint.config(
    { ignores: ['vendor/**', 'public/**', 'node_modules/**', 'storage/**', 'bootstrap/**', 'coverage/**', 'playwright-report/**', 'test-results/**'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    ...vue.configs['flat/recommended'],
    {
        files: ['**/*.{ts,vue}'],
        languageOptions: {
            parser: vueParser,
            parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'], sourceType: 'module' },
            globals: { ...globals.browser, ...globals.node },
        },
        rules: {
            'vue/multi-word-component-names': 'off',
            'vue/max-attributes-per-line': 'off',
            'vue/singleline-html-element-content-newline': 'off',
            'vue/html-indent': 'off',
            'vue/html-self-closing': 'off',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
        },
    },
    {
        // D3: the core is pure — no Vue, DOM storage, realtime or network.
        files: ['resources/js/core/**/*.ts'],
        ignores: ['resources/js/core/**/__tests__/**'],
        rules: {
            'no-restricted-imports': ['error', { patterns: ['vue', 'vue-router', 'pinia', 'idb', 'laravel-echo', 'pusher-js', '@/*', '../*/**'] }],
            'no-restricted-globals': ['error', 'fetch', 'window', 'document', 'indexedDB', 'localStorage', 'navigator', 'XMLHttpRequest', 'WebSocket'],
        },
    },
);
