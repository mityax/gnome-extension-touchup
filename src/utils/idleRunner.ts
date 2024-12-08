import GLib from "gi://GLib";

export class IdleRunner {
    private readonly callback: (stop: () => void, dt: number | null) => any;
    private idleId: number | null = null;
    private readonly _priority: number;
    private lastRun: number | null = null;

    constructor(callback: (stop: () => void, dt: number | null) => any, priority: number = GLib.PRIORITY_DEFAULT_IDLE) {
        this.callback = callback;
        this._priority = priority;
    }

    /**
     * Start the idle runner if it is not running already.
     */
    start() {
        if (this.idleId !== null) return;

        const iid = GLib.idle_add(this._priority,
            () => {
                let now = Date.now();
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
