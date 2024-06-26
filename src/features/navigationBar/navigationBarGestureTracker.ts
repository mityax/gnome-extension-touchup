import GObject from "@girs/gobject-2.0";
import Clutter from "@girs/clutter-14";

import * as Main from '@girs/gnome-shell/ui/main';
import Shell from "@girs/shell-14";
import {debugLog, log} from "$src/utils/utils";
import {Widgets} from "$src/utils/ui/widgets";
import GLib from "@girs/glib-2.0";
import {css} from "$src/utils/ui/css";
import St from "@girs/st-14";
import Stage = Clutter.Stage;


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

    private recordedEvents: Array<_SemanticEvent> = [];
    private _strokeDelta: [number, number] = [0, 0];

    //@ts-ignore
    _init(allowedModes: Shell.ActionMode = Shell.ActionMode.ALL, nTouchPoints: number = 1, thresholdTriggerEdge: Clutter.GestureTriggerEdge = Clutter.GestureTriggerEdge.AFTER) {
        super._init();
        this.set_n_touch_points(nTouchPoints);
        this.set_threshold_trigger_edge(thresholdTriggerEdge);

        this._allowedModes = allowedModes;
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
        this.recordedEvents = [];
        this.pushEvent(this.get_last_event(0));
        return true;
    }

    vfunc_gesture_progress(_actor: Clutter.Actor) {
        let [x, y] = this.get_motion_coords(0);
        let [initialX, initialY] = this.get_press_coords(0);

        let deltaX = x - this.recordedEvents.at(-1)!.x,
            deltaY = y - this.recordedEvents.at(-1)!.y;

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
        this.pushEvent(this.get_last_event(0));

        return true;
    }

    vfunc_gesture_end(_actor: Clutter.Actor) {
        this.pushEvent(this.get_last_event(0));
        //drawBall(this.recordedEvents);

        let swipe = detectStraightLineSwipe(
            this.recordedEvents,
            St.ThemeContext.get_for_stage(global.stage as Stage).scaleFactor
        );

        debugLog("Swipe: ", swipe);

        if (swipe) {
            // up = 0, right = 90, down = 180, left = 270
            if (315 <= swipe.swipeAngle || swipe.swipeAngle <= 45) {
                this.emit('end', 'up', swipe.swipeSpeed);
            } else if (45 <= swipe.swipeAngle && swipe.swipeAngle <= 135) {
                this.emit('end', 'right', swipe.swipeSpeed);
            } else if (135 <= swipe.swipeAngle && swipe.swipeAngle <= 225) {
                this.emit('end', 'down', swipe.swipeSpeed);
            } else if (225 <= swipe.swipeAngle && swipe.swipeAngle <= 315) {
                this.emit('end', 'left', swipe.swipeSpeed);
            }
        } else {
            this.emit('end', null, null);
        }
    }

    vfunc_gesture_cancel(_actor: Clutter.Actor) {
        let time = Clutter.get_current_event_time();

        this.emit('cancel', time);
        this.pushEvent(this.get_last_event(0));
    }

    private pushEvent(event: Clutter.Event) {
        if (event.type() == Clutter.EventType.TOUCH_BEGIN ||
            event.type() == Clutter.EventType.BUTTON_PRESS) {
            this.recordedEvents.push({
                type: 'down',
                x: event.get_coords()[0],
                y: event.get_coords()[1],
                timestamp: event.get_time(),
                e: event,
            })
        } else if (event.type() == Clutter.EventType.MOTION ||
            event.type() == Clutter.EventType.TOUCH_UPDATE) {
            this.recordedEvents.push({
                type: 'move',
                x: event.get_coords()[0],
                y: event.get_coords()[1],
                timestamp: event.get_time(),
                e: event,
            })
        } else if (event.type() == Clutter.EventType.BUTTON_RELEASE ||
            event.type() == Clutter.EventType.TOUCH_END ||
            event.type() == Clutter.EventType.TOUCH_CANCEL) {
            this.recordedEvents.push({
                type: 'up',
                x: event.get_coords()[0],
                y: event.get_coords()[1],
                timestamp: event.get_time(),
                e: event,
            })
        }
    }
}



const SIGNIFICANT_ANGLE_CHANGE = 30; // degrees
const PAUSE_TOLERANCE = 12; // delta_pixels
const SIGNIFICANT_PAUSE = 1000; // milliseconds

function detectStraightLineSwipe(events: _SemanticEvent[], scalingFactor: number) {
    if (events.length < 2) return null;

    // up = 0, right = 90, down = 180, left = 270
    const angleBetween = (dx: number, dy: number) => (Math.atan2(dy, dx) * 180 / Math.PI + 450) % 360;

    let initialAngle = angleBetween(events[1].x - events[0].x, events[1].y - events[0].y);
    let totalDx = 0, totalDy = 0, totalDt = 0;
    let pauseTime = 0, pauseDx = 0, pauseDy = 0;

    for (let i = 1; i < events.length; i++) {
        const currentEvent = events[i];
        const previousEvent = events[i - 1];

        const dx = currentEvent.x - previousEvent.x,
              dy = currentEvent.y - previousEvent.y,
              dt = currentEvent.timestamp - previousEvent.timestamp;
        const d  = Math.sqrt(dx**2 + dy**2);

        debugLog(`event #${i}: \tdx=${dx.toFixed(1)}\tdy=${dy.toFixed(1)}\tdt=${dt} ms\t|\t` +
                      `speed=${(d / dt).toFixed(4)} px/ms\tangle=${angleBetween(dx, dy).toFixed(1)} deg`)

        if (dt === 0 && dx === 0 && dy === 0) continue;

        if (Math.sqrt(pauseDx**2 + pauseDy**2) <= PAUSE_TOLERANCE * scalingFactor) {
            pauseTime += dt;
            pauseDx += dx;
            pauseDy += dy;
        } else {
            pauseTime = 0;
            pauseDx = 0;
            pauseDy = 0;
        }

        if (pauseTime >= SIGNIFICANT_PAUSE) {
            totalDx = totalDy = totalDt = 0; // Significant pause detected
            debugLog(`  - significant pause! (${pauseTime} ms > ${SIGNIFICANT_PAUSE} ms; d=${Math.sqrt(pauseDx**2 + pauseDy**2)})`)
            continue;
        }

        if (pauseTime === 0 && d > PAUSE_TOLERANCE * scalingFactor) {  // only check angle if there's enough movement
            const currentAngle = angleBetween(dx, dy);
            const angleDiff = currentAngle - initialAngle;

            initialAngle = currentAngle;

            if (Math.abs(angleDiff) > SIGNIFICANT_ANGLE_CHANGE) {
                // Significant angle change detected
                debugLog(`  - angle change! (${angleDiff} deg, dx=${dx}, dy=${dy})`)
                totalDx = dx;
                totalDy = dy;
                totalDt = dt;
                continue;
            }
        }

        totalDx += dx;
        totalDy += dy;
        totalDt += dt;
    }

    if (totalDx == 0 && totalDy == 0) {
        return null;  // swipe has ended with a pause, so we don't fire
    }

    return {
        deltaX: totalDx,
        deltaY: totalDy,
        swipeDistance: Math.sqrt(totalDx**2 + totalDy ** 2),
        swipeAngle: angleBetween(totalDx, totalDy),
        swipeSpeed: Math.sqrt(totalDx**2 + totalDy ** 2) / totalDt,
        totalTime: totalDt,
    };
}



/**
 * draw a ball to visualize the event speed and direction for developing purposes
 */
function drawBall(recordedEvents: _SemanticEvent[]) {

    // TODO: remove events with too little difference to previous positions
    // TODO: use avg of speed of points in last <n> period of time for speed calculation

    const startX = recordedEvents.at(-1)!.x;
    const startY = recordedEvents.at(-1)!.y;
    const dx = recordedEvents.at(-1)!.x - recordedEvents.at(-2)!.x;
    const dy = recordedEvents.at(-1)!.y - recordedEvents.at(-2)!.y;
    const dt = recordedEvents.at(-1)!.timestamp - recordedEvents.at(-2)!.timestamp;

    const ball = new St.Bin({
        width: 25,
        height: 25,
        style: css({
            backgroundColor: 'red',
            borderRadius: '20px',
        }),
        x: startX,
        y: startY,
    });

    global.stage.add_child(ball);

    let speedX = dx / (dt + 1e10);
    let speedY = dy / (dt + 1e10);
    let t = 0;
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 5, () => {
        t += 5;
        ball.x += speedX * t;
        ball.y += speedY * t;
        speedX *= 0.6;
        speedY *= 0.6;

        //log("Ball pos: ", ball.x, ball.y, speedX, speedY);

        if (Math.abs(speedX * 5) < 3 && Math.abs(speedY * 5) < 3) {
            global.stage.remove_child(ball);
            return GLib.SOURCE_REMOVE;
        } else {
            return GLib.SOURCE_CONTINUE;
        }
    });
}

