import GObject from "@girs/gobject-2.0";
import Clutter from "@girs/clutter-13";

import * as Main from '@girs/gnome-shell/ui/main';
import Shell from "@girs/shell-13";

export class TouchSwipeGesture extends Clutter.GestureAction {
    static {
        GObject.registerClass({
            Properties: {
                'distance': GObject.ParamSpec.double(
                    'distance', 'distance', 'distance',
                    GObject.ParamFlags.READWRITE,
                    0, Infinity, 0),
                'orientation': GObject.ParamSpec.enum(
                    'orientation', 'orientation', 'orientation',
                    GObject.ParamFlags.READWRITE,
                    Clutter.Orientation, Clutter.Orientation.HORIZONTAL),
            },
            Signals: {
                'begin':  {param_types: [GObject.TYPE_UINT, GObject.TYPE_DOUBLE, GObject.TYPE_DOUBLE]},
                'update': {param_types: [GObject.TYPE_UINT, GObject.TYPE_DOUBLE, GObject.TYPE_DOUBLE]},
                'end':    {param_types: [GObject.TYPE_UINT, GObject.TYPE_DOUBLE]},
                'cancel': {param_types: [GObject.TYPE_UINT, GObject.TYPE_DOUBLE]},
            }
        }, this);
    }

    declare private _allowedModes: Shell.ActionMode;
    declare private _distance: number;
    declare private _lastPosition: number;

    _init(allowedModes: Shell.ActionMode = Shell.ActionMode.ALL, nTouchPoints: number = 1, thresholdTriggerEdge: Clutter.GestureTriggerEdge = Clutter.GestureTriggerEdge.AFTER) {
        super._init();
        this.set_n_touch_points(nTouchPoints);
        this.set_threshold_trigger_edge(thresholdTriggerEdge);

        this._allowedModes = allowedModes;
        this._distance = global.screen_height;
        this._lastPosition = 0;
    }

    get distance() {
        return this._distance;
    }

    set distance(distance) {
        if (this._distance === distance)
            return;

        this._distance = distance;
        this.notify('distance');
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
        const swipeOrientation = Math.abs(xDelta) > Math.abs(yDelta)
            ? Clutter.Orientation.HORIZONTAL : Clutter.Orientation.VERTICAL;

        if (swipeOrientation !== this.orientation)
            return false;

        this._lastPosition =
            this.orientation === Clutter.Orientation.VERTICAL ? y : x;

        this.emit('begin', time, xPress, yPress);
        return true;
    }

    vfunc_gesture_progress(_actor: Clutter.Actor) {
        let [x, y] = this.get_motion_coords(0);
        let initialPos = this.get_press_coords(0)[this.orientation === Clutter.Orientation.VERTICAL ? 1 : 0];
        let pos = this.orientation === Clutter.Orientation.VERTICAL ? y : x;

        let delta = pos - this._lastPosition;
        this._lastPosition = pos;

        let time = this.get_last_event(0).get_time();

        this.emit('update', time, -delta, initialPos - pos);

        return true;
    }

    vfunc_gesture_end(_actor: Clutter.Actor) {
        let [x, y] = this.get_motion_coords(0);
        let initialPos = this.get_press_coords(0)[this.orientation === Clutter.Orientation.VERTICAL ? 1 : 0];
        let pos = this.orientation === Clutter.Orientation.VERTICAL ? y : x;

        let time = this.get_last_event(0).get_time();

        this.emit('end', time, initialPos - pos);
    }

    vfunc_gesture_cancel(_actor: Clutter.Actor) {
        let time = Clutter.get_current_event_time();

        this.emit('cancel', time, this._distance);
    }
}


