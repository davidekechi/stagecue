<script setup lang="ts">
// FR-C6 / LLD §6.6 rule 6 — drafts are only ever sent by an explicit “Send now”.
import type { Draft } from '@/storage/db';

defineProps<{ drafts: Draft[]; canSend: boolean }>();
const emit = defineEmits<{ send: [id: string]; discard: [id: string] }>();
</script>

<template>
    <section v-if="drafts.length" class="flex flex-col gap-3 rounded-3xl border-2 border-dashed border-standby/60 p-4" aria-labelledby="drafts-h" data-testid="draft-list">
        <h2 id="drafts-h" class="text-lg font-semibold">Drafts</h2>
        <p class="-mt-2 text-sm text-muted">Saved while the display was unreachable. Nothing is sent until you choose to.</p>
        <ul class="flex flex-col gap-3">
            <li v-for="d in drafts" :key="d.id" class="flex flex-col gap-2 rounded-2xl bg-panel p-3" data-testid="draft">
                <p class="line-clamp-3 whitespace-pre-wrap text-base">{{ d.label }}</p>
                <div class="flex gap-2">
                    <button type="button" class="h-12 flex-1 rounded-xl bg-ink font-semibold text-desk disabled:opacity-40" :disabled="!canSend" data-testid="draft-send" @click="emit('send', d.id)">Send now</button>
                    <button type="button" class="h-12 rounded-xl border-2 border-panel-2 px-4 font-semibold" data-testid="draft-discard" @click="emit('discard', d.id)">Discard</button>
                </div>
            </li>
        </ul>
    </section>
</template>
