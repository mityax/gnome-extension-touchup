import Clutter from "@girs/clutter-14";
import GObject from "@girs/gobject-2.0";
import {debugLog, log} from "../../utils/utils";

type _SemanticEvent = {
    type: 'up' | 'move' | 'down',
    x: number,
    y: number,
    timestamp: number,
    e: Clutter.Event,
}

export default class GestureDetector {
    private recordedEvents: Array<_SemanticEvent> = [];

    pushEvent(event: Clutter.Event) {
        debugLog('Gesture motion dela: ', event.get_gesture_motion_delta());
        debugLog('Gesture motion dela (unaccelerated): ', event.get_gesture_motion_delta_unaccelerated());
        if (this.recordedEvents.length > 0) {
            debugLog('Angle: ', this.recordedEvents.at(-1)!.e.get_angle(event))
        }

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
