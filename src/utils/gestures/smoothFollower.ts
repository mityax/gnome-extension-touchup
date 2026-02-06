import {IdleRunner} from "$src/utils/idleRunner";
import GLib from "gi://GLib";

/**
 * One “lane” of a smooth‑following animation.
 *
 * Holds a current value, a target value, and an update callback.  Whenever the value
 * is moved toward the target the supplied `onUpdate` callback is invoked with the
 * new value.
 */
export class SmoothFollowerLane {
    /** The current value of this lane */
    currentValue: number | null;

    /** The target value of this lane. This is what the `currentValue` is smoothly driven towards. */
    target: number | null;

    /** Smooth time for the spring animation */
    smoothTime: number;

    /** Callback to apply to new `currentValue` whenever it changed */
    onUpdate: (value: number) => void;

    constructor(props: {
        currentValue?: number,
        target?: number,
        smoothTime?: number
        onUpdate: (value: number) => void,
    }) {
        this.currentValue = props.currentValue ?? null;
        this.target = props.target ?? null;
        this.smoothTime = props.smoothTime ?? 0.05;
        this.onUpdate = props.onUpdate;
    }
}


/**
 * Drives a collection of `SmoothFollowerLane` instances.
 *
 * On each idle tick the lane values are smoothly moved toward their targets. The class itself
 * exposes only the API inherited from `IdleRunner` (namely `start` and `stop` methods);
 * interaction is performed by mutating the lane objects.
 */
export class SmoothFollower<T extends SmoothFollowerLane[]> extends IdleRunner {
    private readonly _lanes: T;
    private readonly _internalState: {
        velocity: number,
    }[] = [];

    // Lane updates will be skipped if the time since the last update was shorter than `1 / MAX_FPS`
    // in order to not waste CPU time:
    private maxFps = 60;
    private lastRun: number | null = null;


    constructor(lanes: T) {
        super((_) => this._update());

        this._lanes = lanes;
        this._internalState = lanes.map(lane => ({
            velocity: 0,
        }));
    }

    /**
     * Start the SmoothFollower. This function receives a void callback as it's only argument which
     * you can optionally use to set initial [SmoothFollowerLane] state.
     *
     * The callback will be called immediately and synchronously.
     */
    start(setupCb?: (...lanes: T) => void) {
        setupCb?.(...this._lanes);
        super.start();

        // Update max fps based on the current stage views:
        this.maxFps = Math.max(
            ...global.stage.peek_stage_views().map(v => v.get_refresh_rate()),
            60,
        )
    }

    /**
     * Call this function to emit updates to the state of any lane. It receives a void callback as
     * it's only argument which you should use to mutate the [SmoothFollowerLane] state.
     *
     * The callback will be called immediately and synchronously, after which the SmoothFollower will
     * immediately emit an update on all lanes.
     */
    update(updateCb: (...lanes: T) => void) {
        updateCb(...this._lanes);
        this._update();
    }

    /**
     * Stop this SmoothFollower and reset all state. It is guaranteed that after calling this function
     * no further lane updates will be emitted.
     */
    stop() {
        super.stop();

        this.lastRun = null;

        for (const l of this._lanes) {
            l.target = null;
            l.currentValue = null;
        }

        for (const i of this._internalState) {
            i.velocity = 0;
        }
    }

    private _update() {
        let now = GLib.get_monotonic_time();
        let dt = this.lastRun != null ? now - this.lastRun : 0;

        // Don't emit an update if the time since the last update exceeds MAX_FPS:
        if (dt > 0 && dt / 1000 / 1000 < 1 / this.maxFps) return;

        this.lastRun = now;

        for (let i = 0; i < this._lanes.length; i++) {
            const lane = this._lanes[i];

            if (lane.target !== null && lane.currentValue !== null) {
                lane.currentValue = this._criticallyDampedSpring(
                    lane.currentValue,
                    lane.target,
                    lane.smoothTime,
                    dt,
                    this._internalState[i],
                );

                lane.onUpdate(lane.currentValue);
            }
        }
    }

    private _criticallyDampedSpring(
        current: number,
        target: number,
        smoothTime: number,
        dt: number,
        state: typeof this._internalState[0],
    ): number {
        dt = dt / 1000 / 1000;  // convert to seconds

        const omega = 2.0 / smoothTime;
        const x = omega * dt;
        const exp = 1.0 / (1.0 + x + 0.48*x**2 + 0.235*x**3);

        const change = current - target;
        const temp = (state.velocity + omega * change) * dt;

        state.velocity = (state.velocity - omega * temp) * exp;
        return target + (change + temp) * exp;
    }
}
