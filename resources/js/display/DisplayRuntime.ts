// LLD §4.3, §5.5–5.7 — the authoritative Display runtime (local mode; remote intake arrives in T6.5).
import type { Clock } from '@/core/clock';
import { uuidv7, ulid } from '@/core/ids';
import { apply, createInitialState, internal } from '@/core/reducer';
import { isExpired as messageDue } from '@/core/message';
import { isExpired as timerDue } from '@/core/timer';
import type { Ack, Action, ApplyResult, CommandName, CommandPayloads, DomainEvent, InternalEvent, PresentationState } from '@/core/types';
import type { ProcessedRecord } from '@/storage/db';
import type { MetaRepo } from '@/storage/MetaRepo';
import type { PresentationRepo } from '@/storage/PresentationRepo';
import type { ProcessedCommandRepo } from '@/storage/ProcessedCommandRepo';
import { ClockReconciler } from './ClockReconciler';
import { CommitQueue } from './commitQueue';
import { TickLoop, type TickLoopDeps } from './TickLoop';

/** Anything that can publish the current state (the SnapshotPublisher, or a no-op in local mode). */
export interface SnapshotSink {
    publishNow(ack?: Ack): void;
}

export const noopPublisher: SnapshotSink = { publishNow: () => {} };

export interface RuntimeWarnings {
    /** IndexedDB writes are failing (quota, private mode): running in memory only. */
    storageFailed: boolean;
    /** A corrupt stored state was quarantined at boot. */
    recoveredFromCorrupt: boolean;
}

export interface DisplayRuntimeDeps {
    clock: Clock;
    repo: PresentationRepo;
    processed: ProcessedCommandRepo;
    meta?: MetaRepo | null;
    publisher?: SnapshotSink;
    reconciler?: ClockReconciler;
    newPresentationId?: (now: number) => string;
    /** Timer/visibility plumbing for the TickLoop (tests inject fakes). */
    scheduler?: Omit<TickLoopDeps, 'nowEff' | 'monoNow' | 'onTick' | 'onError'>;
    onState?: (state: PresentationState, events: DomainEvent[]) => void;
    onNow?: (nowEff: number) => void;
    onWarning?: (warnings: RuntimeWarnings) => void;
}

type Due = { at: number; name: InternalEvent };

/** Internal transitions that are due at `now`, in time order (LLD §5.5 catch-up). */
export function dueInternalEvents(s: PresentationState, now: number): Due[] {
    const due: Due[] = [];
    if (timerDue(s.timer, now) && s.timer.status === 'running') due.push({ at: s.timer.endsAtWall, name: 'TIMER_EXPIRED' });
    if (messageDue(s.message, now) && s.message.status === 'showing' && s.message.expiresAtWall !== null) {
        due.push({ at: s.message.expiresAtWall, name: 'MESSAGE_EXPIRED' });
    }
    return due.sort((a, b) => a.at - b.at);
}

/**
 * Applies every due internal event at its HISTORICAL time, which keeps rule A2 deterministic
 * (e.g. a message that expired before the timer did leaves the full overtime screen).
 */
export function catchUp(s: PresentationState, now: number): { state: PresentationState; events: DomainEvent[] } {
    const events: DomainEvent[] = [];
    // Applying one event can make another due (or not); loop until stable. At most two iterations in practice.
    for (let guard = 0; guard < 4; guard++) {
        const due = dueInternalEvents(s, now);
        if (due.length === 0) break;
        for (const d of due) {
            const r = apply(s, internal(d.name), d.at);
            if (r.ok && r.changed) {
                s = r.state;
                events.push(...r.events);
            }
        }
    }
    return { state: s, events };
}

export class DisplayRuntime {
    private _state: PresentationState;
    private _lastEvents: DomainEvent[] = [];
    private readonly queue = new CommitQueue();
    private readonly reconciler: ClockReconciler;
    private readonly publisher: SnapshotSink;
    private readonly loop: TickLoop;
    private readonly warnings: RuntimeWarnings = { storageFailed: false, recoveredFromCorrupt: false };
    private booted = false;

    constructor(private readonly deps: DisplayRuntimeDeps) {
        this.reconciler = deps.reconciler ?? new ClockReconciler(deps.clock);
        this.publisher = deps.publisher ?? noopPublisher;
        this._state = createInitialState(this.newId(), this.reconciler.nowEff());
        this.loop = new TickLoop({
            ...deps.scheduler,
            nowEff: () => this.reconciler.nowEff(),
            monoNow: () => deps.clock.monoNow(),
            onTick: () => this.tick(),
            onError: (error) => this.reportError(error, 'tick'),
        });
    }

    get state(): PresentationState {
        return this._state;
    }

    get lastEvents(): DomainEvent[] {
        return this._lastEvents;
    }

    get isBooted(): boolean {
        return this.booted;
    }

    nowEff(): number {
        return this.reconciler.nowEff();
    }

    clockOffset(): number {
        return this.reconciler.offset();
    }

    getWarnings(): RuntimeWarnings {
        return { ...this.warnings };
    }

    /** Hydrate → catch up → persist → render → tick (LLD §5.5, local part). */
    async boot(): Promise<void> {
        await this.queue.run(async () => {
            let loaded: PresentationState | null = null;
            try {
                loaded = await this.deps.repo.load();
                if (this.deps.repo.lastLoadCorrupt) this.setWarning('recoveredFromCorrupt', true);
            } catch (error) {
                this.reportError(error, 'load');
                this.setWarning('storageFailed', true);
            }
            const n = this.reconciler.nowEff();
            const base = loaded ?? createInitialState(this.newId(), n);
            const { state, events } = catchUp(base, n);
            this._state = state;
            this._lastEvents = events;
            if (!loaded || events.length > 0) await this.persist(state);
            this.emit(state, events);
        });
        this.booted = true;
        this.deps.onNow?.(this.reconciler.nowEff());
        this.loop.start();
        this.publisher.publishNow();
    }

    stop(): void {
        this.loop.stop();
    }

    /** A local (keyboard / setup panel) command: baseRevision = null, never acked. */
    local<N extends CommandName>(name: N, payload: CommandPayloads[N] | Record<string, never> = {}): Promise<ApplyResult> {
        const action: Action = { kind: 'command', name, payload, commandId: uuidv7(), baseRevision: null };
        return this.queue.run(() => this.applyAndCommit(action, this.reconciler.nowEff()));
    }

    /** Called by the TickLoop. Reconciles clocks, raises due internal events, updates `now`. */
    tick(): void {
        const sample = this.reconciler.sample();
        if (sample.kind === 'clockChanged') {
            // Rebase inside the queue so no in-flight command can overwrite it, and only render
            // the new `now` once the state is on the same timeline (no one-frame overtime flash).
            void this.queue.run(async () => {
                const shifted = ClockReconciler.shiftState(this._state, sample.drift);
                const next = { ...shifted, revision: shifted.revision + 1, updatedAtWall: this.reconciler.nowEff() };
                await this.commitState(next, ['ClockAdjusted']);
                this.raiseDue();
                this.deps.onNow?.(this.reconciler.nowEff());
            });
            return;
        }
        this.raiseDue();
        this.deps.onNow?.(this.reconciler.nowEff());
    }

    private raiseDue(): void {
        if (dueInternalEvents(this._state, this.reconciler.nowEff()).length === 0) return;
        void this.queue.run(async () => {
            const { state, events } = catchUp(this._state, this.reconciler.nowEff());
            if (events.length > 0) await this.commitState(state, events);
        });
    }

    /** Wake-up hook (visibilitychange/pageshow/focus/online): re-sample and tick right away. */
    wake(): void {
        if (this.booted) this.loop.tickNow();
    }

    /** Resolves once all queued work has been applied and persisted. */
    idle(): Promise<void> {
        return this.queue.idle();
    }

    // ---- internals -------------------------------------------------------------------------------

    /** Must run inside the commit queue. */
    protected async applyAndCommit(action: Action, at: number, processed?: (r: ApplyResult) => ProcessedRecord | undefined, ack?: Ack): Promise<ApplyResult> {
        const r = apply(this._state, action, at, { newPresentationId: (now) => this.newId(now) });
        if (r.ok && r.changed) {
            await this.commitState(r.state, r.events, processed?.(r), ack);
        } else if (ack) {
            this.publisher.publishNow(ack);
        }
        return r;
    }

    /** Must run inside the commit queue: persist (single tx) → emit → publish. */
    protected async commitState(state: PresentationState, events: DomainEvent[], processed?: ProcessedRecord, ack?: Ack): Promise<void> {
        this._state = state;
        this._lastEvents = events;
        await this.persist(state, processed);
        this.emit(state, events);
        this.publisher.publishNow(ack);
    }

    private async persist(state: PresentationState, processed?: ProcessedRecord): Promise<void> {
        try {
            await this.deps.repo.commit(state, processed);
            if (this.warnings.storageFailed) this.setWarning('storageFailed', false);
        } catch (error) {
            // Keep running in memory; surface the warning in the SetupPanel only (LLD §4.9).
            this.setWarning('storageFailed', true);
            this.reportError(error, 'persist');
        }
    }

    private emit(state: PresentationState, events: DomainEvent[]): void {
        try {
            this.deps.onState?.(state, events);
        } catch (error) {
            this.reportError(error, 'render');
        }
    }

    private setWarning<K extends keyof RuntimeWarnings>(key: K, value: RuntimeWarnings[K]): void {
        if (this.warnings[key] === value) return;
        this.warnings[key] = value;
        this.deps.onWarning?.({ ...this.warnings });
    }

    protected reportError(error: unknown, context: string): void {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[stagecue] ${context}:`, error);
        void this.deps.meta?.logError({ at: this.deps.clock.wallNow(), message, context }).catch(() => undefined);
    }

    private newId(now: number = this.deps.clock.wallNow()): string {
        return this.deps.newPresentationId ? this.deps.newPresentationId(now) : ulid(now);
    }
}
