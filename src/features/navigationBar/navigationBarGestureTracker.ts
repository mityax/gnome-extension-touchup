import GObject from "gi://GObject";
import Clutter from "gi://Clutter";

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Shell from "gi://Shell";
import {debugLog} from "$src/utils/logging";
import {GestureRecognizer, GestureRecognizerEvent} from "$src/utils/ui/gestureRecognizer";
import St from "gi://St";


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

    declare private recognizer: GestureRecognizer;

    //@ts-ignore
    _init(allowedModes: Shell.ActionMode = Shell.ActionMode.ALL, nTouchPoints: number = 1, thresholdTriggerEdge: Clutter.GestureTriggerEdge = Clutter.GestureTriggerEdge.AFTER) {
        super._init();
        this.set_n_touch_points(nTouchPoints);
        this.set_threshold_trigger_edge(thresholdTriggerEdge);

        this._allowedModes = allowedModes;
        this.recognizer = new GestureRecognizer({
            scaleFactor: St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scaleFactor,
        });
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
        this.recognizer.push(GestureRecognizerEvent.fromClutterEvent(this.get_last_event(0)));
        return true;
    }

    vfunc_gesture_progress(_actor: Clutter.Actor) {
        let [x, y] = this.get_motion_coords(0);
        let [initialX, initialY] = this.get_press_coords(0);

        let time = this.get_last_event(0).get_time();

        this.emit('update', time, initialX - x, initialY - y);
        this.recognizer.push(GestureRecognizerEvent.fromClutterEvent(this.get_last_event(0)));

        return true;
    }

    vfunc_gesture_end(_actor: Clutter.Actor) {
        const state = this.recognizer.push(GestureRecognizerEvent.fromClutterEvent(this.get_last_event(0)));

        let lastPattern = state.lastPattern || null;

        debugLog("Full gesture: ", state.toString());
        debugLog("Last Pattern: ", lastPattern);

        if (lastPattern && lastPattern.type === 'swipe') {
            this.emit('end', lastPattern.direction, lastPattern.speed);
        } else {
            this.emit('end', null, null);
        }
    }

    vfunc_gesture_cancel(_actor: Clutter.Actor) {
        let time = Clutter.get_current_event_time();

        this.emit('cancel', time);
        this.recognizer.push(GestureRecognizerEvent.fromClutterEvent(this.get_last_event(0)));
    }
}
