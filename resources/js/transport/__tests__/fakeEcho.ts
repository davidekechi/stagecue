import type { EchoLike, Member, PresenceLike } from '../RealtimeClient';

type Cb = (p: unknown) => void;

/** An in-memory Echo stand-in: tests can emit events, whispers and socket state changes. */
export class FakeEcho implements EchoLike {
    channels = new Map<string, FakeChannel>();
    left: string[] = [];
    disconnected = false;
    connects = 0;
    private stateCb: ((s: { current: string }) => void) | null = null;
    connector = {
        pusher: {
            connection: {
                state: 'connecting',
                bind: (_e: string, cb: (s: { current: string }) => void) => (this.stateCb = cb),
            },
            connect: () => this.connects++,
        },
    };

    setState(s: string) {
        this.connector.pusher.connection.state = s;
        this.stateCb?.({ current: s });
    }

    private get(name: string) {
        let ch = this.channels.get(name);
        if (!ch) this.channels.set(name, (ch = new FakeChannel()));
        return ch;
    }

    private(name: string) {
        return this.get(`private-${name}`);
    }

    join(name: string) {
        return this.get(`presence-${name}`);
    }

    leave(name: string) {
        this.left.push(name);
    }

    disconnect() {
        this.disconnected = true;
    }
}

export class FakeChannel implements PresenceLike {
    events = new Map<string, Cb[]>();
    whispers: Array<{ event: string; data: unknown }> = [];
    subscribedCbs: Array<() => void> = [];
    errorCbs: Cb[] = [];
    hereCb: ((m: Member[]) => void) | null = null;
    joiningCb: ((m: Member) => void) | null = null;
    leavingCb: ((m: Member) => void) | null = null;

    listen(event: string, cb: Cb) {
        this.events.set(event, [...(this.events.get(event) ?? []), cb]);
        return this;
    }
    listenForWhisper(event: string, cb: Cb) {
        return this.listen(`client-${event}`, cb);
    }
    whisper(event: string, data: Record<string, unknown>) {
        this.whispers.push({ event, data });
        return this;
    }
    subscribed(cb: () => void) {
        this.subscribedCbs.push(cb);
        return this;
    }
    error(cb: Cb) {
        this.errorCbs.push(cb);
        return this;
    }
    here(cb: (m: Member[]) => void) {
        this.hereCb = cb;
        return this;
    }
    joining(cb: (m: Member) => void) {
        this.joiningCb = cb;
        return this;
    }
    leaving(cb: (m: Member) => void) {
        this.leavingCb = cb;
        return this;
    }

    emit(event: string, payload: unknown) {
        for (const cb of this.events.get(event) ?? []) cb(payload);
    }
    fireSubscribed() {
        for (const cb of this.subscribedCbs) cb();
    }
}
