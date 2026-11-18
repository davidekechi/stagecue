<script setup lang="ts">
// FR-C1/C2 — compose, preview and send a message; clear the one on screen.
import { computed } from 'vue';
import type { Corner } from '@/core/types';
import type { PendingCommand } from '@/control/CommandOutbox';
import CommandButton from './CommandButton.vue';
import CornerPicker from './CornerPicker.vue';
import MessageDurationPicker from './MessageDurationPicker.vue';

defineProps<{
    canSend: boolean;
    showing: boolean;
    sendEntry?: PendingCommand;
    clearEntry?: PendingCommand;
}>();
const emit = defineEmits<{ preview: []; send: []; draft: []; clear: []; retry: [id: string]; discard: [id: string] }>();
const text = defineModel<string>('text', { required: true });
const durationMs = defineModel<number | null>('durationMs', { required: true });
const corner = defineModel<Corner>('corner', { required: true });

const MAX = 500;
const valid = computed(() => text.value.trim().length > 0 && text.value.length <= MAX);
const left = computed(() => MAX - text.value.length);

defineExpose({ valid });
</script>

<template>
    <section class="flex flex-col gap-4 rounded-3xl bg-panel p-4" aria-labelledby="msg-h" data-testid="message-composer">
        <h2 id="msg-h" class="text-lg font-semibold">Message</h2>
        <label class="flex flex-col gap-1.5">
            <span class="sr-only">Message text</span>
            <textarea
                v-model="text"
                rows="3"
                :maxlength="MAX"
                placeholder="Please take your seats"
                class="min-h-24 w-full resize-y rounded-2xl border-2 border-panel-2 bg-desk px-4 py-3 text-lg leading-snug outline-none focus:border-ink/50"
                data-testid="msg-text"
            ></textarea>
            <span class="self-end text-xs tabular" :class="left < 30 ? 'text-standby' : 'text-muted'" data-testid="msg-counter">{{ left }} characters left</span>
        </label>

        <div class="flex flex-col gap-2">
            <span class="text-sm font-medium text-muted">Show for</span>
            <MessageDurationPicker v-model="durationMs" />
        </div>
        <div class="flex flex-col gap-2">
            <span class="text-sm font-medium text-muted">Timer moves to</span>
            <CornerPicker v-model="corner" />
        </div>

        <div class="grid grid-cols-2 gap-3">
            <button type="button" class="h-14 rounded-xl border-2 border-panel-2 text-[1.05rem] font-semibold disabled:opacity-40" :disabled="!valid" data-testid="msg-preview" @click="emit('preview')">Preview</button>
            <CommandButton v-if="canSend" label="Send live" tone="primary" testid="msg-send" :entry="sendEntry" :disabled="!valid" @press="emit('send')" @retry="emit('retry', $event)" @discard="emit('discard', $event)" />
            <button v-else type="button" class="h-14 rounded-xl border-2 border-standby text-[1.05rem] font-semibold text-standby disabled:opacity-40" :disabled="!valid" data-testid="msg-draft" @click="emit('draft')">Save as draft</button>
        </div>
        <p v-if="!canSend" class="text-sm text-muted">The display isn’t connected. Drafts wait here until you send them.</p>
        <CommandButton v-if="showing" label="Clear message" testid="msg-clear" :entry="clearEntry" :disabled="!canSend" @press="emit('clear')" @retry="emit('retry', $event)" @discard="emit('discard', $event)" />
    </section>
</template>
