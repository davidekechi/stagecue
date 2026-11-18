<script setup lang="ts">
// Home: choose a role. A paired phone gets one tap back to its display (pairing persists).
import { onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import InstallPrompt from "@/components/common/InstallPrompt.vue";
import { getAccount, logout } from "@/account/account";
import { getDb } from "@/storage/db";
import { DeviceRepo } from "@/storage/DeviceRepo";
import { ApiClient } from "@/transport/ApiClient";

const props = defineProps<{ api?: ApiClient }>();
const paired = ref<{ sessionName: string } | null>(null);
const account = ref(getAccount());
const loggingOut = ref(false);

onMounted(async () => {
    if (!account.value) return;
    const creds = await new DeviceRepo(await getDb(), "controller")
        .get()
        .catch(() => null);
    if (creds)
        paired.value = { sessionName: creds.sessionName ?? "your display" };
});

/** A24 — logging out is a deliberate unpair: this device's pairing and display session go too. */
async function onLogout() {
    loggingOut.value = true;
    const db = await getDb().catch(() => null);
    if (db) {
        for (const role of ["controller", "display"] as const) {
            const repo = new DeviceRepo(db, role);
            const creds = await repo.get().catch(() => null);
            if (!creds) continue;
            const api = new ApiClient({ token: () => creds.token });
            await (
                role === "controller"
                    ? api.leave(creds.sessionId)
                    : api.endSession(creds.sessionId)
            ).catch(() => undefined);
            await repo.clear().catch(() => undefined);
        }
    }
    await logout(props.api ?? new ApiClient());
    paired.value = null;
    account.value = null;
    loggingOut.value = false;
}
</script>

<template>
    <main
        class="min-h-full bg-desk px-5 py-10 text-ink"
        data-testid="home-view"
    >
        <div class="mx-auto flex max-w-md flex-col gap-6">
            <header>
                <h1 class="text-4xl font-bold">StageCue</h1>
                <p class="mt-2 text-muted">
                    A presentation timer you control from your phone.
                </p>
            </header>

            <template v-if="account">
                <RouterLink
                    v-if="paired"
                    to="/control"
                    class="flex flex-col rounded-2xl bg-ink px-5 py-4 text-desk"
                    data-testid="home-reconnect"
                >
                    <span class="text-lg font-bold">Reconnect to {{ paired.sessionName }}</span>
                    <span class="text-sm opacity-70">This phone is still paired</span>
                </RouterLink>

                <RouterLink
                    to="/display"
                    class="rounded-2xl border-2 border-panel-2 px-5 py-4 text-lg font-semibold"
                    data-testid="home-display"
                    >Use this device as the display</RouterLink>
                <RouterLink
                    to="/pair"
                    class="rounded-2xl border-2 border-panel-2 px-5 py-4 text-lg font-semibold"
                    data-testid="home-controller"
                >
                    {{
                        paired
                            ? "Pair with a different display"
                            : "Use this device as the controller"
                    }}
                </RouterLink>

                <div
                    class="flex items-center justify-between gap-3 text-sm text-muted"
                    data-testid="home-account"
                >
                    <span class="min-w-0 truncate">Logged in as
                        <strong class="text-ink">{{
                            account.username
                        }}</strong></span>
                    <button
                        type="button"
                        class="h-11 shrink-0 rounded-lg px-3 font-semibold text-ink underline underline-offset-4"
                        :disabled="loggingOut"
                        data-testid="home-logout"
                        @click="onLogout"
                    >
                        {{ loggingOut ? "Logging out…" : "Log out" }}
                    </button>
                </div>
            </template>

            <template v-else>
                <p class="text-[0.95rem] leading-relaxed text-muted">
                    Log in to use this device as the display or as the
                    controller. Use the same account on both.
                </p>
                <RouterLink
                    to="/login"
                    class="flex h-14 items-center justify-center rounded-2xl bg-ink text-lg font-semibold text-desk"
                    data-testid="home-login"
                    >Log in</RouterLink>
                <RouterLink
                    :to="{ path: '/login', query: { mode: 'register' } }"
                    class="rounded-2xl border-2 border-panel-2 px-5 py-4 text-center text-lg font-semibold"
                    data-testid="home-register"
                    >Create an account</RouterLink>
            </template>

            <InstallPrompt />
        </div>
    </main>
</template>
