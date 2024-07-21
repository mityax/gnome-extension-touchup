import GObject from "@girs/gobject-2.0";
import Clutter from "@girs/clutter-14";

import * as Main from '@girs/gnome-shell/ui/main';
import Shell from "@girs/shell-14";
import {TouchGesture2dRecognizer} from "$src/utils/ui/touchGesture2dRecognizer";
import {debugLog} from "$src/utils/logging";


type _SemanticEvent = {
    type: 'up' | 'move' | 'down',
    x: number,
    y: number,
    timestamp: number,
    e: Clutter.Event,
}


export class NavigationBarGestureTracker extends Clutter.GestureAction {
    static {
        GObject.registerClass({
            Properties: {},
            Signals: {
                'begin':  {param_types: [GObject.TYPE_UINT, GObject.TYPE_DOUBLE, GObject.TYPE_DOUBLE]},
                'update': {param_types: [GObject.TYPE_UINT, GObject.TYPE_DOUBLE, GObject.TYPE_DOUBLE]},
                'end':    {param_types: [GObject.TYPE_STRING, GObject.TYPE_DOUBLE]},
                'cancel': {param_types: [GObject.TYPE_UINT]},
            }
        }, this);
    }

    private _orientation: Clutter.Orientation | null = null;
    declare private _allowedModes: Shell.ActionMode;

    declare private recognizer: TouchGesture2dRecognizer;

    //@ts-ignore
    _init(allowedModes: Shell.ActionMode = Shell.ActionMode.ALL, nTouchPoints: number = 1, thresholdTriggerEdge: Clutter.GestureTriggerEdge = Clutter.GestureTriggerEdge.AFTER) {
        super._init();
        this.set_n_touch_points(nTouchPoints);
        this.set_threshold_trigger_edge(thresholdTriggerEdge);

        this._allowedModes = allowedModes;
        this.recognizer = new TouchGesture2dRecognizer();
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

        this.emit('begin', time, xPress, yPress);
        this.recognizer.addEvent(this.get_last_event(0));
        return true;
    }

    vfunc_gesture_progress(_actor: Clutter.Actor) {
        let [x, y] = this.get_motion_coords(0);
        let [initialX, initialY] = this.get_press_coords(0);

        let time = this.get_last_event(0).get_time();

        this.emit('update', time, initialX - x, initialY - y);
        this.recognizer.addEvent(this.get_last_event(0));

        return true;
    }

    vfunc_gesture_end(_actor: Clutter.Actor) {
        this.recognizer.addEvent(this.get_last_event(0));

        let lastPattern = this.recognizer.getPatterns().at(-1) || null;

        debugLog("Last Pattern: ", lastPattern);

        if (lastPattern && lastPattern.type === 'swipe') {
            this.emit('end', lastPattern.swipeDirection, lastPattern.swipeSpeed);
        } else {
            this.emit('end', null, null);
        }
    }

    vfunc_gesture_cancel(_actor: Clutter.Actor) {
        let time = Clutter.get_current_event_time();

        this.emit('cancel', time);
        this.recognizer.addEvent(this.get_last_event(0));
    }
}
