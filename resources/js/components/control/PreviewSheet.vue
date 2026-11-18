<script setup lang="ts">
// FR-P1..4 — a local simulation in a 16:9 frame. Nothing is sent until “Send live”.
import { computed, ref } from 'vue';
import Stage from '@/components/stage/Stage.vue';
import type { MessageShowPayload } from '@/core/types';
import type { Mirror } from '@/control/MirrorClock';
import { previewView } from '@/control/PreviewModel';
import { useMonoNow } from '@/control/useMonoNow';

const props = defineProps<{ mirror: Mirror | null; message: MessageShowPayload | null; canSend: boolean }>();
const emit = defineEmits<{ close: []; send: [] }>();
const mono = useMonoNow();
const asOvertime = ref(false);
const view = computed(() => previewView({ mirror: props.mirror, monoNow: mono.value, message: props.message, asOvertime: asOvertime.value }));
</script>

<template>
    <div class="fixed inset-0 z-50 flex flex-col justify-end bg-black/70" data-testid="preview-sheet" @click.self="emit('close')">
        <div class="flex flex-col gap-4 rounded-t-3xl bg-panel p-4 pb-8" role="dialog" aria-modal="true" aria-label="Preview">
            <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold">Preview</h2>
                <button type="button" class="h-11 rounded-xl px-3 font-semibold text-muted" @click="emit('close')">Close</button>
            </div>
            <p class="text-sm text-muted">Not live. This is how the display would look.</p>
            <div class="aspect-video w-full overflow-hidden rounded-2xl border-2 border-dashed border-panel-2">
                <Stage :view="view" mode="preview" />
            </div>
            <label class="flex min-h-12 items-center justify-between gap-3 rounded-xl bg-desk px-4">
                <span>Preview as overtime</span>
                <input v-model="asOvertime" type="checkbox" class="h-6 w-6 accent-stage-red" data-testid="preview-overtime" />
            </label>
            <button type="button" class="h-14 rounded-xl bg-ink text-lg font-semibold text-desk disabled:opacity-40" :disabled="!message || !canSend" data-testid="preview-send" @click="emit('send')">Send live</button>
        </div>
    </div>
</template>
