import GLib from "@girs/glib-2.0";

/**
 * IntervalRunner class manages a recurring callback execution at a specified interval with a specified priority.
 *
 * @class IntervalRunner
 *
 * @example
 * // Create a new IntervalRunner that executes a callback every 1000 milliseconds
 * const runner = new IntervalRunner(1000, (stop) => {
 *     console.log("Callback executed");
 *     // Call stop() to stop the interval if needed
 * });
 *
 * // Start the interval
 * runner.start();
 *
 * // Change the interval to 2000 milliseconds
 * runner.setInterval(2000);
 *
 * // Change the priority
 * runner.setPriority(GLib.PRIORITY_HIGH);
 *
 * // Stop the interval
 * runner.stop();
 *
 * @constructor
 * @param {number} interval - The interval in milliseconds at which the callback should be executed.
 * @param {(stop: () => void) => any} callback - The callback function to be executed at each interval.
 *        The callback receives a stop function as an argument which can be called to stop the interval.
 * @param {number} [priority=GLib.PRIORITY_DEFAULT] - The priority of the interval, default is GLib.PRIORITY_DEFAULT.
 */
export class IntervalRunner {
    private readonly callback: (stop: () => void) => any;
    private timeoutId: number | null = null;
    private _interval: number;
    private _priority: number;

    constructor(interval: number, callback: (stop: () => void) => any, priority: number = GLib.PRIORITY_DEFAULT) {
        this.callback = callback;
        this._interval = interval;
        this._priority = priority;
    }

    /**
     * Start the interval runner or restart it if it is running already.
     */
    start() {
        this.stop();
        const tid = GLib.timeout_add(this._priority, this._interval, () => {
            this.callback(this.stop.bind(this));
            return this.timeoutId === tid ? GLib.SOURCE_CONTINUE : GLib.SOURCE_REMOVE;
        })
        this.timeoutId = tid;
    }

    /**
     * Stop the interval. Can be resumed using `start()`.
     */
    stop() {
        if (this.timeoutId !== null) {
            GLib.source_remove(this.timeoutId);
            this.timeoutId = null;
        }
    }

    /**
     * Declarative way of starting/stopping the interval runner.
     *
     * Calling this with `active=true` while the timeout is running or with `active=false`
     * while it is not running is a no-op.
     */
    setActive(active: boolean) {
        if (!active && this.timeoutId !== null) {
            this.stop()
        } else if (active && this.timeoutId === null) {
            this.start();
        }
    }

    /**
     * Run the callback once after the given delay (unless `stop()` is called before that)
     */
    scheduleOnce(delayMs: number = 0) {
        GLib.timeout_add(this._priority, delayMs, () => {
            if (this.timeoutId != null) {
                this.callback(this.stop.bind(this));
            }
            return GLib.SOURCE_REMOVE;
        })
    }

    /**
     * Change the interval. Restarts the callback automatically if a different interval than the
     * previous one is given.
     */
    setInterval(interval: number) {
        if (interval !== this._interval) {
            this._interval = interval;
            this.start();
        }
    }

    /**
     * Change the callback priority. Restarts the callback automatically if a different priority than
     * the previous one is given.
     */
    setPriority(priority: number) {
        if (priority != this._priority) {
            this._priority = priority;
            this.start();
        }
    }

    get priority(): number {
        return this._priority;
    }
    get interval(): number {
        return this._interval;
    }
}
