import {IdleRunner} from "$src/utils/idleRunner";

/**
 * One “lane” of a smooth‑following animation.
 *
 * Holds a current value, a target value and a max speed.  Whenever the value is moved
 * toward the target the supplied `onUpdate` callback is invoked with the new value.
 */
export class SmoothFollowerLane {
    /** The current value of this lane */
    currentValue: number | null;

    /** The target value of this lane. This is what the `currentValue` is smoothly driven towards. */
    target: number | null;

    /** Callback to apply to new `currentValue` whenever it changed */
    onUpdate: (value: number) => void;

    constructor(props: {
        currentValue?: number,
        target?: number,
        onUpdate: (value: number) => void,
    }) {
        this.currentValue = props.currentValue ?? null;
        this.target = props.target ?? null;
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
export class SmoothFollower extends IdleRunner {
    private readonly _lanes: {
        lane: SmoothFollowerLane,
        internalState: {
            velocity: number,
        }
    }[] = [];

    constructor(lanes: SmoothFollowerLane[]) {
        super((_, dt) => this._update(dt));

        this._lanes = lanes.map(lane => ({
            lane,
            internalState: {velocity: 0},
        }));
    }

    private _update(dt: number | null) {
        dt ??= 1;

        for (let {lane, internalState} of this._lanes) {
            if (lane.target !== null && lane.currentValue !== null) {
                lane.currentValue = this._criticallyDampedSpring(
                    lane.currentValue,
                    lane.target,
                    dt,
                    internalState,
                );

                lane.onUpdate(lane.currentValue);
            }
        }
    }

    static readonly smoothTime = 0.04;  // in seconds
    static readonly omega = 2.0 / this.smoothTime;

    private _criticallyDampedSpring(
        current: number,
        target: number,
        dt: number,
        state: typeof this._lanes[0]['internalState'],
    ): number {
        dt = dt / 1000 / 1000;  // convert to seconds

        const x = SmoothFollower.omega * dt;
        const exp = 1.0 / (1.0 + x + 0.48*x**2 + 0.235*x**3);

        const change = current - target;
        const temp = (state.velocity + SmoothFollower.omega * change) * dt;

        state.velocity = (state.velocity - SmoothFollower.omega * temp) * exp;
        return target + (change + temp) * exp;
    }
}
