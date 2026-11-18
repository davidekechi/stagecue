<script setup lang="ts">
defineProps<{ active: boolean; paused: boolean }>();
</script>

<template>
    <Transition name="ot">
        <div v-if="active" class="stage-overtime" data-testid="stage-overtime" :data-paused="paused">
            <p class="time-up">TIME UP!</p>
            <p v-if="paused" class="paused-label" data-testid="overtime-paused">PAUSED</p>
        </div>
    </Transition>
</template>

<style scoped>
.stage-overtime {
    position: absolute;
    inset: 0;
    z-index: 5;
    background: var(--overtime-bg);
    color: #fff;
}
/* As wide as the safe area allows; the counter sits below at ~70% height. */
.time-up {
    position: absolute;
    left: var(--safe);
    right: var(--safe);
    top: 9%;
    margin: 0;
    text-align: center;
    /* Condensed and bold. "TIME UP!" is 2.72 em wide at wdth 75 → 90% of the width = 33cqw. */
    font-size: min(46cqh, 33cqw);
    font-weight: 800;
    font-stretch: 75%;
    letter-spacing: 0;
    line-height: 1;
    white-space: nowrap;
}
.paused-label {
    position: absolute;
    left: 0;
    right: 0;
    bottom: var(--safe);
    margin: 0;
    text-align: center;
    font-size: 4.5cqh;
    font-weight: 700;
    letter-spacing: 0.3em;
    opacity: 0.8;
}
.ot-enter-active,
.ot-leave-active {
    transition: opacity 400ms ease;
}
.ot-enter-from,
.ot-leave-to {
    opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
    .ot-enter-active,
    .ot-leave-active {
        transition-duration: 0ms;
    }
}
</style>
