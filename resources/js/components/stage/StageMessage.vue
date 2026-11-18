<script setup lang="ts">
import type { Corner } from '@/core/types';
import FitText from './FitText.vue';

defineProps<{ message: { text: string; corner: Corner } | null; hasCompactTimer: boolean }>();
</script>

<template>
    <Transition name="msg">
        <div
            v-if="message"
            class="stage-message"
            data-testid="stage-message"
            :data-corner="message.corner"
            :data-reserve="hasCompactTimer"
            role="status"
            aria-live="polite"
        >
            <FitText :text="message.text" />
        </div>
    </Transition>
</template>

<style scoped>
/* The text area is the 5% safe area minus the band that holds the compact corner timer. */
.stage-message {
    position: absolute;
    inset: var(--safe);
    z-index: 10;
    color: var(--stage-fg);
}
.stage-message[data-reserve='true'][data-corner^='t'] {
    top: calc(var(--safe) + 9cqh);
}
.stage-message[data-reserve='true'][data-corner^='b'] {
    bottom: calc(var(--safe) + 9cqh);
}
.msg-enter-active,
.msg-leave-active {
    transition:
        opacity 300ms ease,
        transform 300ms ease;
}
.msg-enter-from,
.msg-leave-to {
    opacity: 0;
    transform: translateY(3cqh);
}
@media (prefers-reduced-motion: reduce) {
    .msg-enter-active,
    .msg-leave-active {
        transition-duration: 0ms;
    }
}
</style>
