import '@girs/gnome-shell/extensions/global';
import {PatchManager} from "$src/utils/patchManager";
import {Message, MessageListSection} from "@girs/gnome-shell/ui/messageList";
import St from "@girs/st-14";
import Clutter from "@girs/clutter-14";
import {Pattern, TouchGesture2dRecognizer} from "$src/utils/ui/touchGesture2dRecognizer";
import GLib from "@girs/glib-2.0";
import {debugLog, repr} from "$src/utils/logging";


export class NotificationGestures {
    static readonly PATCH_SCOPE: unique symbol = Symbol('notification-gestures');

    private messageListSection?: MessageListSection;

    constructor() {
        const self = this;
        PatchManager.patchMethod(MessageListSection.prototype, 'addMessageAtIndex',
            function(this: MessageListSection, orig, message: St.Widget, idx: number, animate: boolean) {
                debugLog("New message!");
                //const msg = new Message();
                self.messageListSection = this;
                orig(message, idx, animate);
                self._onNewNotification(message);
            },
            { scope: NotificationGestures.PATCH_SCOPE },
        )
    }

    private _onNewNotification(message: Clutter.Actor) {
        const recognizer = new TouchGesture2dRecognizer();

        //debugLog("Setting up gesture for actor: ", message, GObject.signal_handler_find(message, {signalId: 'touch-event'}));
        //debugLog("Setting up gesture for button: ", message.get_child_at_index(0), GObject.signal_handler_find(message.get_child_at_index(0), {signalId: 'touch-event'}));
        //GObject.signal_handler_block(message, GObject.signal_handler_find(message, {signalId: 'touch-event'}))
        //GObject.signal_handler_block(message.get_child_at_index(0), GObject.signal_handler_find(message.get_child_at_index(0), {signalId: 'touch-event'}))

        message.get_parent()!.reactive = true;

        message.reactive = false;  // TODO: find a less hacky way to prevent click actions on touch
        

        let initialPos: number[] | null = null;

        message.get_parent()!.connect('touch-event', (_, e: Clutter.Event) => {
            debugLog(`touch-event (type: ${e.type()}): `, e);  // only thing that works so far (!)
            recognizer.addEvent(e);

            if (e.type() == Clutter.EventType.TOUCH_BEGIN ||
                e.type() == Clutter.EventType.BUTTON_PRESS) {
                initialPos = e.get_coords();
            }
            let dx = e.get_coords()[0] - initialPos![0],
                dy = e.get_coords()[1] - initialPos![1];
            message.translationX = dx;

            if (e.type() == Clutter.EventType.TOUCH_END ||
                e.type() == Clutter.EventType.TOUCH_CANCEL ||
                e.type() == Clutter.EventType.BUTTON_RELEASE) {

                this._onGestureFinished(message, dx, dy, recognizer.getPatterns().at(-1));
            }
        });
    }

    destroy() {
        PatchManager.clear(NotificationGestures.PATCH_SCOPE);
    }

    private _onGestureFinished(actor: Clutter.Actor, dx: number, dy: number, lastPattern: Pattern | undefined) {
        debugLog(`Gesture done, dx=${dx}, dy=${dy}, lastPattern=${repr(lastPattern)}`);
        if (lastPattern == null) return;

        // TODO: Prevent message from activating click action somehow

        if (dx > 0 && lastPattern.type === 'swipe' && lastPattern.swipeDirection == 'left'
            || dx < 0 && lastPattern.type === 'swipe' && lastPattern.swipeDirection == 'right') {
            actor.ease({
                translationX: 0,
                duration: 300,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            })
        } else if (lastPattern.type === 'swipe' && lastPattern.swipeDirection == 'down') {
            (actor as Message).expand(true);
            debugLog("Expanding message");
        } else if (lastPattern.type === 'swipe' && lastPattern.swipeDirection == 'up') {
            (actor as Message).unexpand(true);
            debugLog("Collapsing message");
        }

        if (lastPattern.type === 'swipe' && (
            (dx > 0 && lastPattern.swipeDirection == 'right') ||
            (dx < 0 && lastPattern.swipeDirection == 'left')
        )) {
            debugLog("Dismissing message");
            actor.ease({
                translationX: lastPattern.swipeDirection == 'right' ? actor.width : -actor.width,
                duration: 250,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            })
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
                this.messageListSection!.removeMessage(actor as Message, true);
                return GLib.SOURCE_REMOVE;
            })
        } else {
            actor.ease({
                translationX: 0,
                duration: 300,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            })
        }
    }
}
