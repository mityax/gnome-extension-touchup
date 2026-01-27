import {IdleRunner} from "./idleRunner";

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

    /** The maximum speed at which `currentValue` can change in units per millisecond. */
    maxSpeed: number;

    /** Callback to apply to new `currentValue` whenever it changed */
    onUpdate: (value: number) => void;

    /** When `currentValue` is closer than `toleranceFactor * maxSpeed` to `target`, it is not changed anymore */
    toleranceFactor: number = 5;

    constructor(props: {
        currentValue?: number,
        target?: number,
        maxSpeed: number,
        onUpdate: (value: number) => void,
        toleranceFactor?: number,
    }) {
        this.currentValue = props.currentValue ?? null;
        this.target = props.target ?? null;
        this.maxSpeed = props.maxSpeed;
        this.onUpdate = props.onUpdate;
        this.toleranceFactor = props.toleranceFactor ?? 5;
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
    private readonly _lanes: SmoothFollowerLane[] = [];

    constructor(lanes: SmoothFollowerLane[]) {
        super((_, dt) => this._update(dt));

        this._lanes = lanes;
    }

    private _update(dt: number | null) {
        dt ??= 1;

        for (let lane of this._lanes) {
            if (lane.target !== null && lane.currentValue !== null) {
                const dist = lane.target - lane.currentValue;

                if (Math.abs(dist) > lane.toleranceFactor * lane.maxSpeed) {
                    lane.currentValue += Math.sign(dist) * Math.min(dist ** 2, dt * (lane.maxSpeed / 1000));
                    lane.onUpdate(lane.currentValue);
                }
            }
        }
    }
}
