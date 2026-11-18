<script setup lang="ts">
// A24 — log in (or sign up) before using this device as a display or a controller.
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { authErrorMessage, login, register } from "@/account/account";
import { ApiClient, ApiError } from "@/transport/ApiClient";

const props = defineProps<{ api?: ApiClient }>();
const api = props.api ?? new ApiClient();
const router = useRouter();
const route = useRoute();

const mode = ref<"login" | "register">(
    route.query.mode === "register" ? "register" : "login",
);
const email = ref("");
const password = ref("");
const confirmation = ref("");
const busy = ref(false);
const error = ref<string | null>(null);

const next = computed(() => {
    const n = String(route.query.next ?? "/");
    return n.startsWith("/") && !n.startsWith("//") ? n : "/";
});
const canSubmit = computed(
    () =>
        email.value.trim().length > 0 &&
        password.value.length > 0 &&
        (mode.value === "login" || confirmation.value.length > 0) &&
        !busy.value,
);

function switchMode(m: "login" | "register") {
    mode.value = m;
    error.value = null;
}

async function submit() {
    if (!canSubmit.value) return;
    busy.value = true;
    error.value = null;
    try {
        if (mode.value === "login")
            await login(api, email.value.trim(), password.value);
        else
            await register(
                api,
                email.value.trim(),
                password.value,
                confirmation.value,
            );
        await router.replace(next.value);
    } catch (e) {
        error.value =
            e instanceof ApiError
                ? authErrorMessage(e.code, e.details)
                : authErrorMessage(undefined);
    } finally {
        busy.value = false;
    }
}
</script>

<template>
    <main
        class="min-h-full bg-desk px-5 pb-10 pt-8 text-ink"
        data-testid="login-view"
    >
        <div class="mx-auto flex max-w-sm flex-col gap-7">
            <header>
                <p class="text-sm font-semibold text-muted">StageCue</p>
                <h1 class="mt-1 text-[1.75rem] font-bold leading-tight">
                    {{ mode === "login" ? "Log in" : "Create an account" }}
                </h1>
                <p class="mt-2 text-[0.95rem] leading-relaxed text-muted">
                    Use the same account on the display and on the phone. A
                    phone can only pair with a display logged in to the same
                    account.
                </p>
            </header>

            <div
                class="grid grid-cols-2 rounded-xl bg-panel p-1"
                role="tablist"
                aria-label="Log in or sign up"
            >
                <button
                    type="button"
                    role="tab"
                    class="h-11 rounded-lg text-[0.95rem] font-semibold"
                    :class="
                        mode === 'login' ? 'bg-ink text-desk' : 'text-muted'
                    "
                    :aria-selected="mode === 'login'"
                    data-testid="login-tab"
                    @click="switchMode('login')"
                >
                    Log in
                </button>
                <button
                    type="button"
                    role="tab"
                    class="h-11 rounded-lg text-[0.95rem] font-semibold"
                    :class="
                        mode === 'register' ? 'bg-ink text-desk' : 'text-muted'
                    "
                    :aria-selected="mode === 'register'"
                    data-testid="register-tab"
                    @click="switchMode('register')"
                >
                    Sign up
                </button>
            </div>

            <form
                class="flex flex-col gap-4"
                novalidate
                @submit.prevent="submit"
            >
                <label class="flex flex-col gap-1.5">
                    <span class="text-sm font-semibold">Email</span>
                    <input
                        id="login-email"
                        v-model="email"
                        type="email"
                        inputmode="email"
                        autocomplete="username"
                        autocapitalize="none"
                        autocorrect="off"
                        spellcheck="false"
                        maxlength="254"
                        class="h-14 rounded-xl border-2 border-panel-2 bg-transparent px-4 text-lg outline-none focus:border-ink"
                        data-testid="login-email"
                    />
                </label>
                <label class="flex flex-col gap-1.5">
                    <span class="text-sm font-semibold">Password</span>
                    <input
                        id="login-password"
                        v-model="password"
                        type="password"
                        :autocomplete="
                            mode === 'login'
                                ? 'current-password'
                                : 'new-password'
                        "
                        maxlength="200"
                        class="h-14 rounded-xl border-2 border-panel-2 bg-transparent px-4 text-lg outline-none focus:border-ink"
                        data-testid="login-password"
                    />
                    <span v-if="mode === 'register'" class="text-xs text-muted">At least 8 characters.</span>
                </label>
                <label v-if="mode === 'register'" class="flex flex-col gap-1.5">
                    <span class="text-sm font-semibold">Confirm password</span>
                    <input
                        id="login-confirm"
                        v-model="confirmation"
                        type="password"
                        autocomplete="new-password"
                        maxlength="200"
                        class="h-14 rounded-xl border-2 border-panel-2 bg-transparent px-4 text-lg outline-none focus:border-ink"
                        data-testid="login-confirm"
                    />
                </label>

                <p
                    v-if="error"
                    class="rounded-xl border border-stage-red/60 bg-stage-red/15 px-4 py-3 text-[0.95rem] leading-snug"
                    role="alert"
                    data-testid="login-error"
                >
                    {{ error }}
                </p>

                <button
                    type="submit"
                    class="flex h-14 items-center justify-center rounded-xl bg-ink text-lg font-semibold text-desk disabled:opacity-40"
                    :disabled="!canSubmit"
                    data-testid="login-submit"
                >
                    {{
                        busy
                            ? "One moment…"
                            : mode === "login"
                              ? "Log in"
                              : "Create account"
                    }}
                </button>
            </form>
        </div>
    </main>
</template>
