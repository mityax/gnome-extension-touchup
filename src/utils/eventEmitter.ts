
type _ListenerRecord<A extends Record<string, [...any]>, B extends keyof A> = {
    signal: B,
    callbacks: {
        id: number,
        fn: ((...args: A[B]) => void),
        options: _ConnectionOpts,
    }[],
}

type _ConnectionOpts = {
    once?: boolean,
}


export default class EventEmitter<A extends Record<string, [...any]>> {
    private readonly _listeners: _ListenerRecord<A, any>[] = [];
    private _idCounter = 0;

    emit<N extends keyof A>(s: N, ...args: A[N]) {
        const listeners =
            this._listeners.find((l) => l.signal === s);

        if (listeners) {
            listeners.callbacks.forEach((l, idx) => l.fn(...args));
            listeners.callbacks = listeners.callbacks.filter(l => !l.options.once);
        }
    }

    connect<N extends keyof A>(signal: N, callback: (...args: A[N]) => void): number {
        return this._connect(signal, callback);
    }

    connectOnce<N extends keyof A>(signal: N, callback: (...args: A[N]) => void): number {
        return this._connect(signal, callback, {once: true});
    }

    disconnect(id: number): boolean {
        for (let sig of this._listeners) {
            for (let i = 0; i < sig.callbacks.length; i++) {
                if (sig.callbacks[i].id === id) {
                    sig.callbacks.splice(i, 1);
                    return true;
                }
            }
        }

        return false;
    }

    protected _hasListenersFor<N extends keyof A>(signal: N) {
        return this._listeners
            .find((l) => l.signal === signal)
            ?.callbacks.length ?? 0 > 0;
    }

    private _connect<N extends keyof A>(signal: N, callback: (...args: A[N]) => void, opts?: _ConnectionOpts) {
        const id = this._idCounter++;
        let array = this._listeners
            .find((l) => l.signal === signal)
            ?.callbacks;

        if (!array) {
            array = [];
            this._listeners.push({
                signal,
                callbacks: array,
            });
        }

        array.push({
            id,
            fn: callback,
            options: opts ?? {},
        });

        return id;
    }
}
