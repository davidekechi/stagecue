// LLD §4.6 / §6.6 — every sent command and its acknowledgement state. Never replays on its own.
import type { Ack, CommandName, CommandRequest, RejectCode } from '@/core/types';
import { ApiError, type CommandResponse } from '@/transport/ApiClient';

export type OutboxStatus = 'sending' | 'awaiting' | 'confirmed' | 'rejected' | 'unconfirmed' | 'failed';
export type Terminal = 'confirmed' | 'rejected' | 'unconfirmed' | 'failed';

export interface PendingCommand {
    commandId: string;
    name: CommandName;
    request: CommandRequest;
    status: OutboxStatus;
    code?: RejectCode | string | null;
    message?: string | null;
}

export const ACK_TIMEOUT_MS = 3_000;
export const CONFIRMED_LINGER_MS = 800;
export const REJECTED_LINGER_MS = 6_000;

export interface CommandOutboxDeps {
    post: (req: CommandRequest) => Promise<CommandResponse>;
    onChange: (entries: PendingCommand[]) => void;
    onAuthLoss?: (e: ApiError) => void;
    setTimeout?: (fn: () => void, ms: number) => unknown;
    clearTimeout?: (h: unknown) => void;
}

const TERMINAL: ReadonlySet<OutboxStatus> = new Set(['confirmed', 'rejected', 'unconfirmed', 'failed']);

export class CommandOutbox {
    private entries = new Map<string, PendingCommand>();
    private timers = new Map<string, unknown>();
    private waiters = new Map<string, Array<(t: Terminal) => void>>();

    constructor(private readonly deps: CommandOutboxDeps) {}

    list(): PendingCommand[] {
        return [...this.entries.values()];
    }

    get(commandId: string): PendingCommand | undefined {
        return this.entries.get(commandId);
    }

    /** Sends a new command. Resolves with its terminal state. */
    submit(request: CommandRequest): Promise<Terminal> {
        this.set({ commandId: request.commandId, name: request.name, request, status: 'sending' });
        const done = this.wait(request.commandId);
        void this.post(request.commandId);
        return done;
    }

    /** Retry keeps the SAME commandId, so the Display applies it at most once. */
    retry(commandId: string): Promise<Terminal> {
        const e = this.entries.get(commandId);
        if (!e) return Promise.resolve('failed');
        this.set({ ...e, status: 'sending', code: null, message: null });
        const done = this.wait(commandId);
        void this.post(commandId);
        return done;
    }

    discard(commandId: string): void {
        this.clearTimer(commandId);
        this.entries.delete(commandId);
        this.emit();
    }

    /** An ack from a snapshot. */
    ack(a: Ack): void {
        const e = this.entries.get(a.commandId);
        if (!e) return;
        if (a.result === 'REJECTED') this.finish(e, 'rejected', a.code ?? null, a.message ?? null);
        else this.finish(e, 'confirmed');
    }

    /** LLD §6.6 rule 5: on reconnect, anything still waiting is unconfirmed — the operator decides. */
    invalidateAwaiting(): void {
        for (const e of this.entries.values()) if (e.status === 'awaiting' || e.status === 'sending') this.finish(e, 'unconfirmed');
    }

    wait(commandId: string): Promise<Terminal> {
        const e = this.entries.get(commandId);
        if (e && TERMINAL.has(e.status) && e.status !== 'unconfirmed') return Promise.resolve(e.status as Terminal);
        return new Promise((resolve) => this.waiters.set(commandId, [...(this.waiters.get(commandId) ?? []), resolve]));
    }

    private async post(commandId: string): Promise<void> {
        const e = this.entries.get(commandId);
        if (!e) return;
        try {
            const res = await this.deps.post(e.request);
            const cur = this.entries.get(commandId);
            if (!cur || cur.status !== 'sending') return;
            if (res.duplicate && res.status === 'applied') return this.finish(cur, 'confirmed');
            if (res.duplicate && res.status === 'rejected') return this.finish(cur, 'rejected', res.resultCode ?? null, null);
            this.set({ ...cur, status: 'awaiting' });
            this.timer(commandId, ACK_TIMEOUT_MS, () => {
                const now = this.entries.get(commandId);
                if (now?.status === 'awaiting') this.finish(now, 'unconfirmed');
            });
        } catch (error) {
            const cur = this.entries.get(commandId);
            if (!cur) return;
            if (error instanceof ApiError && error.status === 401) {
                this.deps.onAuthLoss?.(error);
                return this.finish(cur, 'failed', error.code, error.message);
            }
            if (error instanceof ApiError && !error.retryable) return this.finish(cur, 'rejected', error.code, error.message);
            this.finish(cur, 'failed', error instanceof ApiError ? error.code : 'NETWORK', error instanceof Error ? error.message : null);
        }
    }

    private finish(e: PendingCommand, status: Terminal, code: string | null = null, message: string | null = null): void {
        this.clearTimer(e.commandId);
        this.set({ ...e, status, code, message });
        for (const w of this.waiters.get(e.commandId) ?? []) w(status);
        this.waiters.delete(e.commandId);
        // Confirmed and rejected entries fade out; unconfirmed/failed wait for Retry or Discard.
        if (status === 'confirmed' || status === 'rejected') {
            this.timer(e.commandId, status === 'confirmed' ? CONFIRMED_LINGER_MS : REJECTED_LINGER_MS, () => {
                if (this.entries.get(e.commandId)?.status === status) this.discard(e.commandId);
            });
        }
    }

    private set(e: PendingCommand): void {
        this.entries.set(e.commandId, e);
        this.emit();
    }

    private emit(): void {
        this.deps.onChange(this.list());
    }

    private timer(id: string, ms: number, fn: () => void): void {
        this.clearTimer(id);
        this.timers.set(id, (this.deps.setTimeout ?? ((f, t) => globalThis.setTimeout(f, t)))(fn, ms));
    }

    private clearTimer(id: string): void {
        const t = this.timers.get(id);
        if (t !== undefined) (this.deps.clearTimeout ?? ((h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>)))(t);
        this.timers.delete(id);
    }
}
