<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
    <main class="mx-auto flex min-h-full max-w-xl flex-col justify-center gap-6 p-6" data-testid="home-view">
        <h1 class="text-4xl font-bold tracking-tight">StageCue</h1>
        <p class="text-neutral-400">A presentation timer you control from your phone.</p>
        <RouterLink to="/display" class="rounded-xl bg-white px-6 py-4 text-center text-lg font-semibold text-black">
            Use this device as Display
        </RouterLink>
        <RouterLink to="/pair" class="rounded-xl border border-neutral-600 px-6 py-4 text-center text-lg font-semibold">
            Use this device as Controller
        </RouterLink>
    </main>
</template>
