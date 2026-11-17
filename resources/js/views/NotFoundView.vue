<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
    <main class="mx-auto max-w-md p-6" data-testid="not-found-view">
        <h1 class="text-2xl font-semibold">Page not found</h1>
        <RouterLink to="/" class="mt-4 inline-block underline">Go home</RouterLink>
    </main>
</template>
