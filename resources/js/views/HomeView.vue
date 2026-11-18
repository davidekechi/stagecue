<script setup lang="ts">
// Home: choose a role. A paired phone gets one tap back to its display (pairing persists).
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import InstallPrompt from '@/components/common/InstallPrompt.vue';
import { getDb } from '@/storage/db';
import { DeviceRepo } from '@/storage/DeviceRepo';

const paired = ref<{ sessionName: string } | null>(null);

onMounted(async () => {
    const creds = await new DeviceRepo(await getDb(), 'controller').get().catch(() => null);
    if (creds) paired.value = { sessionName: creds.sessionName ?? 'your display' };
});
</script>

<template>
    <main class="min-h-full bg-desk px-5 py-10 text-ink" data-testid="home-view">
        <div class="mx-auto flex max-w-md flex-col gap-6">
            <header>
                <h1 class="text-4xl font-bold">StageCue</h1>
                <p class="mt-2 text-muted">A presentation timer you control from your phone.</p>
            </header>

            <RouterLink v-if="paired" to="/control" class="flex flex-col rounded-2xl bg-ink px-5 py-4 text-desk" data-testid="home-reconnect">
                <span class="text-lg font-bold">Reconnect to {{ paired.sessionName }}</span>
                <span class="text-sm opacity-70">This phone is still paired</span>
            </RouterLink>

            <RouterLink to="/display" class="rounded-2xl border-2 border-panel-2 px-5 py-4 text-lg font-semibold" data-testid="home-display">Use this device as the display</RouterLink>
            <RouterLink to="/pair" class="rounded-2xl border-2 border-panel-2 px-5 py-4 text-lg font-semibold" data-testid="home-controller">
                {{ paired ? 'Pair with a different display' : 'Use this device as the controller' }}
            </RouterLink>

            <InstallPrompt />
        </div>
    </main>
</template>
