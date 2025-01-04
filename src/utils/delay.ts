import GLib from "gi://GLib";

/**
 * Returns a promise that resolves after a specified duration (using GLib.timeout_add) or can be canceled.
 *
 * @param durationMs - The duration of the delay in milliseconds.
 * @param onCancel - Specifies the behavior when the delay is canceled:
 *   - `'throw'`: Reject the promise, simulating an error.
 *   - `'resolve'`: Resolve the promise with `false` to indicate cancellation.
 *   - `'nothing'`: Do nothing; the promise remains unresolved.
 *
 * @returns A `CancellablePromise` that:
 *   - Resolves to `true` if the delay completes successfully.
 *   - Resolves to `false` if canceled with `onCancel='resolve'`.
 *   - Rejects if canceled with `onCancel='throw'`.
 *   - Forever remains unresolved if canceled with `onCancel='nothing'` (which is the default)
 *
 * ### Usage
 * ```typescript
 * const promise = Delay.ms(1000, 'resolve').then(result => {
 *     console.log(result ? 'Delay ended!' : 'Cancelling delay!');
 * });
 *
 * // Optionally cancel the delay:
 * let wasCancelled = promise.cancel(); // Cancels the promise
 *
 * console.log(wasCanceled ? "Delay has been canceled successfully!" : "Too late, delay was already over!");
 * ```
 */
export class Delay {
    private static pendingDelays: CancellablePromise<boolean>[] = [];

    static ms(durationMs: number, onCancel: 'throw' | 'resolve' | 'nothing' = 'nothing'): CancellablePromise<boolean> {
        let timeoutHandle: number | null = null;
        let resolve: (v: boolean) => void;
        let reject: () => void;

        const promise = new CancellablePromise<boolean>(
            (res, rej) => {
                [resolve, reject] = [res, rej];
                timeoutHandle = GLib.timeout_add(GLib.PRIORITY_DEFAULT, durationMs, () => {
                    timeoutHandle = null;
                    Delay.pendingDelays = Delay.pendingDelays.filter(d => d !== promise);
                    resolve(true);
                    return GLib.SOURCE_REMOVE;
                });
            },
            () => {
                if (timeoutHandle !== null) {
                    GLib.source_remove(timeoutHandle);
                    Delay.pendingDelays = Delay.pendingDelays.filter(d => d !== promise);
                    if (onCancel === 'throw') reject();
                    else if (onCancel === 'resolve') resolve(false);
                    return true;
                }
                return false;
            }
        );

        this.pendingDelays.push(promise);

        return promise;
    }

    /**
     * Get a list of all pending delays.
     *
     * Only use this if you who know what you're doing.
     */
    public static getAllPendingDelays(): CancellablePromise<boolean>[] {
        return [...this.pendingDelays];
    }
}


export class CancellablePromise<T> extends Promise<T> {
    private readonly _onCancel: () => boolean;

    constructor(
        executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void,
        onCancel: () => boolean
    ) {
        super(executor);
        this._onCancel = onCancel;
    }

    /**
     * Returns true if the promise was cancelled successfully, false if it already ran.
     */
    cancel(): boolean {
        return this._onCancel();
    }

    then<TResult1 = T, TResult2 = never>(
        onFulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
        onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
    ): CancellablePromise<TResult1 | TResult2> {
        return new CancellablePromise<TResult1 | TResult2>((resolve, reject) => {
            super.then(
                // @ts-ignore
                onFulfilled
                    ? (v: T) => resolve(onFulfilled(v))
                    : null,
                onRejected
                    ? (r) => reject(onRejected(r))
                    : null,
            )
        }, this._onCancel);
    }

    catch<TResult>(
        onRejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
    ): CancellablePromise<T | TResult> {
        return new CancellablePromise<T | TResult>((resolve, reject) => {
            // @ts-ignore
            super.catch((r) => {
                const reason = onRejected?.(r);
                reject(reason);
                return reason ?? r;
            });
        }, this._onCancel);
    }
}
