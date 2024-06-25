import GObject from "@girs/gobject-2.0";
import Clutter from "@girs/clutter-14";

import * as Main from '@girs/gnome-shell/ui/main';
import Shell from "@girs/shell-14";
import {log} from "$src/utils/utils";

export class TouchSwipeGesture extends Clutter.GestureAction {
    static {
        GObject.registerClass({
            Properties: {},
            Signals: {
                'begin':  {param_types: [GObject.TYPE_UINT, GObject.TYPE_DOUBLE, GObject.TYPE_DOUBLE]},
                'update': {param_types: [GObject.TYPE_UINT, GObject.TYPE_DOUBLE, GObject.TYPE_DOUBLE]},
                'end':    {param_types: [GObject.TYPE_UINT, GObject.TYPE_DOUBLE, GObject.TYPE_DOUBLE]},
                'cancel': {param_types: [GObject.TYPE_UINT]},
            }
        }, this);
    }

    declare private _allowedModes: Shell.ActionMode;
    declare private _lastPosition: [number, number];
    private _strokeDelta: [number, number] = [0, 0];

    // for ts:
    private _orientation: Clutter.Orientation | null = null;

    //@ts-ignore
    _init(allowedModes: Shell.ActionMode = Shell.ActionMode.ALL, nTouchPoints: number = 1, thresholdTriggerEdge: Clutter.GestureTriggerEdge = Clutter.GestureTriggerEdge.AFTER) {
        super._init();
        this.set_n_touch_points(nTouchPoints);
        this.set_threshold_trigger_edge(thresholdTriggerEdge);

        this._allowedModes = allowedModes;
        this._lastPosition = [0, 0];
    }

    get orientation(): Clutter.Orientation | null {
        return this._orientation;
    }

    set orientation(value: Clutter.Orientation | null) {
        this._orientation = value;
    }

    vfunc_gesture_prepare(actor: Clutter.Actor) {
        if (!super.vfunc_gesture_prepare(actor))
            return false;

        if ((this._allowedModes & Main.actionMode) === 0)
            return false;

        let time = this.get_last_event(0).get_time();
        let [xPress, yPress] = this.get_press_coords(0);
        let [x, y] = this.get_motion_coords(0);
        const [xDelta, yDelta] = [x - xPress, y - yPress];

        if (this._orientation !== null) {
            const swipeOrientation = Math.abs(xDelta) > Math.abs(yDelta)
                ? Clutter.Orientation.HORIZONTAL : Clutter.Orientation.VERTICAL;

            if (swipeOrientation !== this._orientation)
                return false;
        }

        this._lastPosition = [x, y];

        this.emit('begin', time, xPress, yPress);
        this.emit('event', this.get_last_event(0));
        return true;
    }

    vfunc_gesture_progress(_actor: Clutter.Actor) {
        let [x, y] = this.get_motion_coords(0);
        let [initialX, initialY] = this.get_press_coords(0);

        let deltaX = x - this._lastPosition[0],
            deltaY = y - this._lastPosition[1];
        this._lastPosition = [x, y];

        // Update stroke delta - if the current delta has the same sign as the previous delta, the
        // direction has not been changed:
        this._strokeDelta[0] = Math.sign(deltaX) == Math.sign(this._strokeDelta[0])  // if they have the same sign...
            ? this._strokeDelta[0] + deltaX  // ... add them to get the total delta...
            : deltaX;  // ... otherwise reset the total delta because the direction has changed.
        this._strokeDelta[1] = Math.sign(deltaY) == Math.sign(this._strokeDelta[1])
            ? this._strokeDelta[1] + deltaY
            : deltaY;

        let time = this.get_last_event(0).get_time();

        this.emit('update', time, /*[-deltaX, -deltaY], [*/ initialX - x, initialY - y /*], this._strokeDelta*/);

        this.emit('event', this.get_last_event(0));
        return true;
    }

    vfunc_gesture_end(_actor: Clutter.Actor) {
        let [x, y] = this.get_motion_coords(0);
        let [initialX, initialY] = this.get_press_coords(0);

        let time = this.get_last_event(0).get_time();

        this.emit('end', time, this._strokeDelta[0], this._strokeDelta[1]);
        this.emit('event', this.get_last_event(0));
    }

    vfunc_gesture_cancel(_actor: Clutter.Actor) {
        let time = Clutter.get_current_event_time();

        this.emit('cancel', time);
        this.emit('event', this.get_last_event(0));
    }
}


