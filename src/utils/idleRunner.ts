import GLib from "gi://GLib";

export class IdleRunner {
    private readonly callback: (stop: () => void, dt: number | null) => any;
    private idleId: number | null = null;
    private readonly _priority: number;
    private lastRun: number | null = null;

    /**
     * Constructs an IdleRunner using the given callback and idle priority.
     *
     * @param callback A callback to call as often as possible, receives a `stop` function and the time since the last
     *                 invocation (in microseconds).
     * @param priority The idle priority. One of the Glib.PRIORITY_* constants.
     */
    constructor(callback: (stop: () => void, dt: number | null) => any, priority: number = GLib.PRIORITY_DEFAULT_IDLE) {
        this.callback = callback;
        this._priority = priority;
    }

    /**
     * An idle runner that is automatically stopped after the callback has been called once.
     *
     * Note that `start` still needs to be called to start the idle runner. If start is called multiple
     * times, the callback will run once per invocation.
     */
    static once(cb: () => void, priority: number = GLib.PRIORITY_DEFAULT_IDLE): IdleRunner {
        return new IdleRunner((stop) => {
            cb();
            stop();
        }, priority);
    }

    /**
     * Start the idle runner if it is not running already.
     */
    start() {
        if (this.idleId !== null) return;

        const iid = GLib.idle_add(this._priority,
            () => {
                let now = GLib.get_monotonic_time();
                let dt = this.lastRun != null ? now - this.lastRun : null;
                this.lastRun = now;

                this.callback(this.stop.bind(this), dt);
                return this.idleId === iid ? GLib.SOURCE_CONTINUE : GLib.SOURCE_REMOVE;
            },
        );
        this.idleId = iid;
    }

    /**
     * Stop running the idle callback. Can be resumed using `start()`.
     */
    stop() {
        if (this.idleId !== null) {
            GLib.source_remove(this.idleId);
            this.idleId = null;
            this.lastRun = null;
        }
    }
}
