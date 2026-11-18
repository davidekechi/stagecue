<script setup lang="ts">
// LLD §4.7 / FR-C3 — a small copy of the Display, using the SAME Stage component.
import { computed } from 'vue';
import Stage from '@/components/stage/Stage.vue';
import { mirrorView, type Mirror } from '@/control/MirrorClock';
import { useMonoNow } from '@/control/useMonoNow';

const props = defineProps<{ mirror: Mirror | null; connected: boolean }>();
const mono = useMonoNow();
const view = computed(() => mirrorView(props.mirror, mono.value));
const blackout = computed(() => props.mirror?.state.display.blackout ?? false);
const live = computed(() => !!props.mirror?.live && props.connected);
</script>

<template>
    <section class="flex flex-col gap-2" aria-label="What the display shows" data-testid="live-mirror">
        <div class="relative overflow-hidden rounded-2xl border-2" :class="blackout ? 'border-stage-red' : live ? 'border-panel-2' : 'border-dashed border-panel-2'">
            <div class="aspect-video w-full">
                <Stage v-if="mirror" :view="view" mode="preview" />
                <div v-else class="flex h-full items-center justify-center bg-black px-6 text-center text-sm text-muted" data-testid="mirror-empty">Waiting for the display…</div>
            </div>
            <span
                class="absolute left-2 top-2 z-[60] inline-flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-xs font-semibold"
                :class="live ? 'text-go' : 'text-standby'"
                data-testid="mirror-tag"
            >
                <i class="h-2 w-2 rounded-full bg-current" aria-hidden="true"></i>{{ live ? 'Live' : 'Last known' }}
            </span>
        </div>
        <p v-if="blackout" class="flex items-center gap-2 rounded-xl bg-stage-red px-4 py-3 text-base font-bold text-white" role="status" data-testid="mirror-blackout">
            Black screen is on — the audience sees nothing.
        </p>
    </section>
</template>
