// A24 — the StageCue account this device is logged in to. The Display and the phone must use the same one.
// Kept in localStorage so the router can check it synchronously; it never holds the password.
import type { ApiClient } from "@/transport/ApiClient";

export interface Account {
    id: number;
    email: string;
    token: string;
}

export const ACCOUNT_KEY = "stagecue.account";

export function getAccount(): Account | null {
    try {
        const raw = globalThis.localStorage?.getItem(ACCOUNT_KEY);
        if (!raw) return null;
        const a = JSON.parse(raw) as Partial<Account>;
        return typeof a.token === "string" &&
            typeof a.email === "string" &&
            typeof a.id === "number"
            ? (a as Account)
            : null;
    } catch {
        return null;
    }
}

export function setAccount(a: Account): void {
    try {
        globalThis.localStorage?.setItem(ACCOUNT_KEY, JSON.stringify(a));
    } catch {
        /* storage blocked: the login lasts for this page only */
    }
}

export function clearAccount(): void {
    try {
        globalThis.localStorage?.removeItem(ACCOUNT_KEY);
    } catch {
        /* nothing stored */
    }
}

export const accountToken = (): string | null => getAccount()?.token ?? null;

interface AuthResponse {
    user: { id: number; email: string };
    token: string;
}

export async function login(
    api: ApiClient,
    email: string,
    password: string,
): Promise<Account> {
    const r = await api.request<AuthResponse>(
        "POST",
        "/auth/login",
        { email, password },
        { auth: false },
    );
    const a = { id: r.user.id, email: r.user.email, token: r.token };
    setAccount(a);
    return a;
}

export async function register(
    api: ApiClient,
    email: string,
    password: string,
    confirmation: string,
): Promise<Account> {
    const r = await api.request<AuthResponse>(
        "POST",
        "/auth/register",
        { email, password, password_confirmation: confirmation },
        { auth: false },
    );
    const a = { id: r.user.id, email: r.user.email, token: r.token };
    setAccount(a);
    return a;
}

/** Revokes this device's login on the server (best effort) and forgets it locally. */
export async function logout(api: ApiClient): Promise<void> {
    const token = accountToken();
    clearAccount();
    if (token)
        await api
            .request<void>("POST", "/auth/logout", undefined, { bearer: token })
            .catch(() => undefined);
}

/** Plain-language messages for login and sign-up failures. */
export function authErrorMessage(
    code: string | undefined,
    fieldErrors?: unknown,
): string {
    if (
        code === "VALIDATION_FAILED" &&
        fieldErrors &&
        typeof fieldErrors === "object"
    ) {
        const first = Object.values(
            fieldErrors as Record<string, string[]>,
        )[0]?.[0];
        if (first) return first;
    }
    switch (code) {
        case "INVALID_CREDENTIALS":
            return "That email and password don’t match an account.";
        case "REGISTRATION_CLOSED":
            return "New accounts can’t be created right now. Ask your team for the login.";
        case "RATE_LIMITED":
            return "Too many attempts. Wait a minute, then try again.";
        case "NETWORK":
        case "TIMEOUT":
            return "Can’t reach StageCue. Check this device’s internet connection.";
        default:
            return "That didn’t work. Try again.";
    }
}
