import { onBeforeUnmount, onMounted, ref } from 'vue';

/** A reactive performance.now() that refreshes a few times a second (mirror and preview clocks). */
export function useMonoNow(intervalMs = 250) {
    const now = ref(performance.now());
    let timer: ReturnType<typeof setInterval> | null = null;
    onMounted(() => (timer = setInterval(() => (now.value = performance.now()), intervalMs)));
    onBeforeUnmount(() => timer && clearInterval(timer));
    return now;
}
