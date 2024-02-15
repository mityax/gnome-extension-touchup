import Clutter from "@girs/clutter-13";
import GObject from "@girs/gobject-2.0";

type _SemanticEvent = {
    type: 'up' | 'move' | 'down',
    x: number,
    y: number,
}

export default class GestureDetector {
    static {
        GObject.registerClass({
            Signals: {
                'swipe-up': {
                    param_types: []
                },
                'swipe-up-and-hold': {
                    param_types: []
                },
                'swipe-left': {
                    param_types: []
                },
                'swipe-right': {
                    param_types: []
                },
            },
        }, this);
    }

    private recordedEvents: Array<_SemanticEvent> = [];

    pushEvent(event: Clutter.Event) {
        if (event.type() == Clutter.EventType.TOUCH_BEGIN ||
            event.type() == Clutter.EventType.BUTTON_PRESS) {
            this.recordedEvents.push({
                type: 'down',
                x: event.get_coords()[0],
                y: event.get_coords()[1],
            })
        } else if (event.type() == Clutter.EventType.MOTION ||
                   event.type() == Clutter.EventType.TOUCH_UPDATE) {
            this.recordedEvents.push({
                type: 'move',
                x: event.get_coords()[0],
                y: event.get_coords()[1],
            })
        } else if (event.type() == Clutter.EventType.BUTTON_RELEASE ||
                   event.type() == Clutter.EventType.TOUCH_END ||
                   event.type() == Clutter.EventType.TOUCH_CANCEL) {
            this.recordedEvents.push({
                type: 'up',
                x: event.get_coords()[0],
                y: event.get_coords()[1],
            })
        }
    }
}
