import '@girs/gnome-shell/extensions/global';
import {PatchManager} from "$src/utils/patchManager";
import {Message, MessageListSection} from "@girs/gnome-shell/ui/messageList";
import St from "@girs/st-14";
import Clutter from "@girs/clutter-14";
import {Pattern, TouchGesture2dRecognizer} from "$src/utils/ui/touchGesture2dRecognizer";
import GLib from "@girs/glib-2.0";
import {debugLog, repr} from "$src/utils/logging";
import {NotificationMessage} from "@girs/gnome-shell/ui/calendar";


export class NotificationGestures {
    static readonly PATCH_SCOPE: unique symbol = Symbol('notification-gestures');

    private messageListSection?: MessageListSection;

    constructor() {
        const self = this;
        PatchManager.patchMethod(MessageListSection.prototype, 'addMessageAtIndex',
            function(this: MessageListSection, orig, message: NotificationMessage, idx: number, animate: boolean) {
                debugLog("New message!");
                //const msg = new Message();
                self.messageListSection = this;
                orig(message, idx, animate);
                self._onNewNotification(message);
            },
            { scope: NotificationGestures.PATCH_SCOPE },
        );
    }

    private _onNewNotification(message: NotificationMessage) {
        const recognizer = new TouchGesture2dRecognizer();

        message.get_parent()!.reactive = true;

        // Make button unreactive to prevent immediate notification activation on any event:
        message.reactive = false;
        // Manually reset style pseudo-class to prevent the insensitive styling from being applied:
        message.pseudoClass = 'normal';
        

        let initialPos: number[] | null = null;
        let isTouched = false;

        const onEvent = (_: Clutter.Actor, e: Clutter.Event) => {
            debugLog("event: ", e.type(), e.get_coords(), Clutter.EventType);

            if (e.type() == Clutter.EventType.TOUCH_BEGIN ||
                e.type() == Clutter.EventType.BUTTON_PRESS) {
                isTouched = true;
                initialPos = e.get_coords();
            }

            let dx = e.get_coords()[0] - initialPos![0],
                dy = e.get_coords()[1] - initialPos![1];

            if (isTouched) {
                message.translationX = dx;
                recognizer.addEvent(e);
            }

            if (e.type() == Clutter.EventType.TOUCH_END ||
                e.type() == Clutter.EventType.TOUCH_CANCEL ||
                e.type() == Clutter.EventType.BUTTON_RELEASE ||
                e.type() == Clutter.EventType.PAD_BUTTON_RELEASE) {

                this._onGestureFinished(message, dx, dy, recognizer, [Clutter.EventType.BUTTON_RELEASE, Clutter.EventType.PAD_BUTTON_RELEASE].indexOf(e.type()) == -1);
                isTouched = false;
            }
        }

        message.get_parent()!.connect('touch-event', onEvent);
        message.get_parent()!.connect('button-press-event', onEvent);
        message.get_parent()!.connect('button-release-event', onEvent);

        message.get_parent()!.connect('enter-event', () => message.pseudoClass = 'hover');
        message.get_parent()!.connect('leave-event', () => message.pseudoClass = 'normal');
    }

    destroy() {
        PatchManager.clear(NotificationGestures.PATCH_SCOPE);
    }

    private _onGestureFinished(message: NotificationMessage, dx: number, dy: number, recognizer: TouchGesture2dRecognizer, isTouch: boolean = true) {
        if (recognizer.isTap() || !isTouch) {
            debugLog("Activating message");
            message.notification.activate();
        } else {
            const lastPattern = recognizer.getPatterns().at(-1)!;

            if (lastPattern.type === 'swipe' && lastPattern.swipeDirection == 'down') {
                (message as Message).expand(true);
                debugLog("Expanding message");
            } else if (lastPattern.type === 'swipe' && lastPattern.swipeDirection == 'up') {
                (message as Message).unexpand(true);
                debugLog("Collapsing message");
            }

            if (lastPattern.type === 'swipe' && (
                (dx > 0 && lastPattern.swipeDirection == 'right') ||
                (dx < 0 && lastPattern.swipeDirection == 'left')
            )) {
                debugLog("Dismissing message");
                message.ease({
                    translationX: lastPattern.swipeDirection == 'right' ? message.width : -message.width,
                    duration: 250,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                })
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
                    this.messageListSection!.removeMessage(message as Message, true);
                    return GLib.SOURCE_REMOVE;
                })
            } else {
                message.ease({
                    translationX: 0,
                    duration: 300,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                })
            }
        }
    }
}
