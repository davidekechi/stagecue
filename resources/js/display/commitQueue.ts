/** A minimal async mutex: tasks run one at a time, in submission order (LLD §4.3). */
export class CommitQueue {
    private tail: Promise<unknown> = Promise.resolve();

    run<T>(task: () => Promise<T> | T): Promise<T> {
        const result = this.tail.then(task);
        this.tail = result.then(
            () => undefined,
            () => undefined,
        );
        return result;
    }

    /** Resolves once every task submitted so far has finished. */
    idle(): Promise<void> {
        return this.tail.then(() => undefined);
    }
}
