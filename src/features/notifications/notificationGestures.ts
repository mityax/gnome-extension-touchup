import St from "gi://St";
import Clutter from "gi://Clutter";

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {MessageListSection} from "resource:///org/gnome/shell/ui/messageList.js";
import {NotificationMessage, NotificationSection} from "resource:///org/gnome/shell/ui/calendar.js";
import {MessageTray} from "resource:///org/gnome/shell/ui/messageTray.js";

import {Patch, PatchManager} from "$src/utils/patchManager";
import {GestureRecognizer2D} from "$src/utils/ui/gestureRecognizer2D";
import {debugLog} from "$src/utils/logging";
import {findActorBy} from "$src/utils/utils";


export class NotificationGestures {
    static readonly PATCH_SCOPE: unique symbol = Symbol('notification-gestures');

    private unpatchOnTrayClose: Patch[] = [];

    constructor() {
        const self = this;

        // Setup listeners for existing notifications in the panel:
        const messageListSection = findActorBy(global.stage, a => a.constructor.name == 'NotificationSection') as (NotificationSection & {_list: St.BoxLayout}) | null;
        messageListSection?._list.get_children().forEach(container => {
            if (container.get_child_at_index(0)) {
                self.patchNotification(container.get_child_at_index(0) as NotificationMessage, false);
            }
        });

        // New message added to message list section in popup:
        PatchManager.appendToMethod(MessageListSection.prototype, 'addMessageAtIndex',
            function(this: MessageListSection, message: NotificationMessage, idx: number, animate: boolean) {
                debugLog("New message in MessageListSection");
                self.patchNotification(message, false);
            },
            { scope: NotificationGestures.PATCH_SCOPE },
        );

        // New message added to message tray:
        PatchManager.appendToMethod(MessageTray.prototype, '_showNotification',
            function(this: MessageTray & {_banner: NotificationMessage}) {
                debugLog("New message in MessageTray");
                self.unpatchOnTrayClose.push(self.patchNotification(this._banner, true));
            },
            { scope: NotificationGestures.PATCH_SCOPE ,
        });

        // When the notification tray banner is closed, un-patch the message and container
        // to avoid double callback invocations:
        PatchManager.appendToMethod(MessageTray.prototype, '_hideNotification', function () {
            self.unpatchOnTrayClose.forEach(p => p.undo())
            self.unpatchOnTrayClose = [];
        })

        // Path the message tray `_updateState` function such that it does not expand the banner on hover:
        PatchManager.patchMethod(MessageTray.prototype, '_updateState',
            function(this: MessageTray & {_banner: NotificationMessage}, orig) {
                if (this._banner) {
                    // we achieve this by making it seem to the function that the banner is already expanded:
                    const originalValue = this._banner?.expanded;
                    this._banner.expanded = true;
                    orig();
                    this._banner.expanded = originalValue;
                } else {
                    orig();
                }
            },
            { scope: NotificationGestures.PATCH_SCOPE },
        );
    }

    private patchNotification(message: NotificationMessage, isTray: boolean) {
        return PatchManager.patch(() => {
            // Make message unreactive to prevent immediate notification activation on any event:
            message.reactive = false;  // (this is necessary as message inherits from St.Button which conflicts with complex reactivity as we want it)
            // Prevent the insensitive styling from being applied:
            message.remove_style_pseudo_class('insensitive');

            // Each message is wrapped by a single bin, which we use for reactivity:
            const container = message.get_parent() as St.Bin;
            container.reactive = true;
            container.trackHover = true;

            // Track and recognize touch and mouse events:
            const recognizer = new GestureRecognizer2D();

            const onEvent = (_: Clutter.Actor, e: Clutter.Event) => {
                recognizer.pushEvent(e);

                if (e.type() == Clutter.EventType.TOUCH_BEGIN ||
                    e.type() == Clutter.EventType.BUTTON_PRESS) {
                    updateHover();
                }

                if (recognizer.isDuringGesture) {
                    if (recognizer.primaryMove?.swipeAxis == 'horizontal') {
                        message.translationX = recognizer.totalMotionDelta.x;
                    } else if (recognizer.primaryMove?.swipeAxis == 'vertical' && isTray) {
                        message.translationY = Math.min(recognizer.totalMotionDelta.y, 0);
                    }
                }

                if (recognizer.gestureHasJustFinished) {
                    this._onGestureFinished(message, recognizer, isTray);
                    updateHover();
                }
            }

            const updateHover = () => {
                if (container.hover || recognizer.isDuringGesture) {
                    message.add_style_pseudo_class('hover');
                } else {
                    message.remove_style_pseudo_class('hover');
                }
            }

            // Setup event handlers:
            let signalIds = [
                container.connect('touch-event', onEvent),
                container.connect('button-press-event', onEvent),
                container.connect('button-release-event', onEvent),
                container.connect('notify::hover', updateHover),
            ]

            return () => {
                // Undo all the changes:
                signalIds.forEach(id => container.disconnect(id));
                message.translationX = 0;
                message.reactive = true;
                container.reactive = false;
                container.trackHover = false;
            }
        }, {scope: NotificationGestures.PATCH_SCOPE});
    }

    destroy() {
        PatchManager.clear(NotificationGestures.PATCH_SCOPE);
    }

    private _onGestureFinished(message: NotificationMessage, recognizer: GestureRecognizer2D, isTray: boolean) {
        debugLog("Gesture: ", recognizer.toString());

        if (recognizer.isTap() || !recognizer.isTouchGesture) {
            //@ts-ignore
            message.notification.activate();
        } else {
            const lastPattern = recognizer.secondaryMove;

            let shouldEaseBack = true;

            if (lastPattern != null) {
                switch (lastPattern.swipeDirection) {
                    case 'up':
                        if (isTray) {
                            // @ts-ignore
                            message.ease({
                                y: -message.height,
                                rotationZ: 90,
                                duration: 100,
                                mode: Clutter.AnimationMode.EASE_OUT,
                                // @ts-ignore
                                onComplete: () => Main.messageTray._hideNotification(false)
                            });
                            shouldEaseBack = false;
                        } else if (message.expanded) {
                            message.unexpand(true);
                        }
                        break;
                    case 'down':
                        if (!message.expanded) {
                            message.expand(true);
                        }
                        break;
                    default:
                        if (lastPattern.swipeDirection == 'right' && recognizer.totalMotionDelta.x > 0 ||
                            lastPattern.swipeDirection == 'left' && recognizer.totalMotionDelta.x < 0) {
                            //@ts-ignore
                            message.ease({
                                translationX: lastPattern.swipeDirection == 'right' ? message.width : -message.width,
                                opacity: 0,
                                duration: 200,
                                mode: Clutter.AnimationMode.EASE_OUT,
                                onComplete: () => message.emit("close"),
                            })
                            shouldEaseBack = false;
                        }
                }

                if (shouldEaseBack) {
                    //@ts-ignore
                    message.ease({
                        translationX: 0,
                        translationY: 0,
                        duration: 200,
                        mode: Clutter.AnimationMode.EASE_OUT_BACK,
                    })
                }
            }
        }
    }
}
