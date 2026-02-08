import St from "gi://St";
import Clutter from "gi://Clutter";

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {
    MessageView,
    NotificationMessage,
    NotificationMessageGroup
} from "resource:///org/gnome/shell/ui/messageList.js";
import {CalendarMessageList} from "resource:///org/gnome/shell/ui/calendar.js";
import * as MessageTray from "resource:///org/gnome/shell/ui/messageTray.js";

import {Patch, PatchManager} from "$src/core/patchManager";
import {findActorBy} from "$src/utils/utils";
import * as Widgets from "$src/utils/ui/widgets";
import ExtensionFeature from "$src/core/extensionFeature";
import {GestureRecognizer, GestureState} from "$src/utils/gestures/gestureRecognizer";
import {SmoothFollower, SmoothFollowerLane} from "$src/utils/gestures/smoothFollower";
import Ref = Widgets.Ref;


export class NotificationGesturesFeature extends ExtensionFeature {
    private unpatchOnTrayClose: Patch[] = [];
    private calendarMessageList: (CalendarMessageList & { _messageView: MessageView }) | null;

    constructor(pm: PatchManager) {
        super(pm);
        const self = this;

        this.calendarMessageList = findActorBy(global.stage, a => a.constructor.name == 'CalendarMessageList') as any;

        this.createMessageTrayPatches(self);
        this.createMessageListPatches(self);
    }

    private createMessageTrayPatches(self: this) {
        // Patch already existing message tray notification:
        // @ts-ignore
        if (Main.messageTray._banner !== null) {
            // @ts-ignore
            self.unpatchOnTrayClose.push(self.patchNotification(Main.messageTray._banner, true));
        }

        // Patch future new notifications added to the tray:
        this.pm.appendToMethod(MessageTray.MessageTray.prototype, '_showNotification',
            function (this: MessageTray.MessageTray & { _banner: NotificationMessage }) {
                self.unpatchOnTrayClose.push(self.patchNotification(this._banner, true));
            },
        );

        // When the tray is hidden, un-patch the message and container to avoid
        // double callback invocations:
        this.pm.appendToMethod(MessageTray.MessageTray.prototype, '_hideNotification', function () {
            self.unpatchOnTrayClose.forEach(p => p.disable())
            self.unpatchOnTrayClose = [];
        })

        // Patch the message tray `_updateState` function such that it does not expand the banner on hover:
        this.pm.patchMethod(MessageTray.MessageTray.prototype, '_updateState',
            function (this: MessageTray.MessageTray & { _banner: NotificationMessage }, orig) {
                // we achieve this by making it seem to the function that the banner is already expanded:
                const originalValue = this._banner?.expanded;
                if (this._banner) this._banner.expanded = true;
                orig();
                if (this._banner) this._banner.expanded = originalValue;
            },
        );
    }

    private createMessageListPatches(self: this) {
        // Setup listeners for existing notification groups in the message list:
        this.calendarMessageList?._messageView.messages.forEach(notificationGroup => {
            // Patch each notification inside the group:
            for (let child of notificationGroup.get_children()) {
                // each notification is wrapped in a [St.Bin], thus we use `.get_first_child()` on it:
                if (child.get_first_child() != null) {
                    self.patchNotification(child.get_first_child() as NotificationMessage, false);
                }
            }
        });

        // New message added to a [NotificationMessageGroup]:
        this.pm.appendToMethod(NotificationMessageGroup.prototype, '_addNotification',
            function (
                this: NotificationMessageGroup & {
                    _notificationToMessage: Map<MessageTray.Notification, NotificationMessage>
                },
                notification: MessageTray.Notification
            ) {
                self.patchNotification(this._notificationToMessage.get(notification)!, false);
            },
        );
    }

    private patchNotification(message: NotificationMessage, isTray: boolean) {
        return this.pm.patch(() => {
            const notificationGroup = message.get_parent()!.get_parent()! as NotificationMessageGroup;

            // This is updated in each call to `onMoveHorizontally` and tracks which actor to move: the
            // [notificationGroup] or the [message]:
            let horizontalMoveActor: Clutter.Actor | null = null;

            // Track and recognize touch and mouse events:
            const gestureHelper = new SwipeGesturesHelper({
                actor: message,
                scrollView: !isTray ? this.calendarMessageList?._scrollView : undefined,
                onMoveHorizontally: (x) => {
                    horizontalMoveActor = notificationGroup.expanded || isTray ? message : notificationGroup;
                    if (message.canClose()) {
                        horizontalMoveActor.translationX = x;
                        const actorWidth = horizontalMoveActor.get_transformed_size()[0];
                        horizontalMoveActor.opacity = 255 - 255 * Math.min(1, Math.abs(x) / actorWidth * 1.3);
                    } else {
                        horizontalMoveActor.translationX = Math.sign(x) * Math.log(Math.abs(x)) ** 3;
                    }
                },
                onMoveVertically: (y) => {
                    if (isTray) {
                        message.translationY = Math.min(y, 0);
                    }
                },
                onScrollScrollView: (deltaY) => this.scrollNotificationList(deltaY),
                onEaseBackPosition: () => {
                    gestureHelper.easeBackPositionOf(horizontalMoveActor!);
                    horizontalMoveActor!.ease({
                        opacity: 255,
                        duration: 200,
                    })
                },
                // @ts-ignore
                onActivate: () => message.notification.activate(),
                onExpand: () => {
                    if (!message.expanded) {
                        message.expand(true);
                    }
                },
                onCollapse: () => {
                    if (isTray) {
                        message.ease({
                            y: -message.height,
                            duration: 100,
                            mode: Clutter.AnimationMode.EASE_OUT,
                            // @ts-ignore
                            onStopped: () => Main.messageTray._hideNotification(false),
                        });
                        return { easeBackPosition: false };
                    } else if (message.expanded) {
                        message.unexpand(true);
                    }
                },
                onClose: (swipeDirection) => {
                    if (message.canClose()) {
                        horizontalMoveActor?.ease({
                            translationX: swipeDirection == 'right' ? message.width : -message.width,
                            opacity: 0,
                            duration: 150,
                            mode: Clutter.AnimationMode.EASE_OUT,
                            onStopped: () => message.emit("close"),
                        });
                    } else {
                        gestureHelper.easeBackPositionOf(horizontalMoveActor!);
                    }
                },
            });

            // Use [Ref]s for the cleanup in order to skip cleanup on already
            // destroyed actors easily:
            let messageRef = new Ref(message);

            const undo = () => {
                // Undo all the changes:
                messageRef.apply(m => {
                    m.translationX = 0;
                });
                gestureHelper.destroy();
            };

            message.connect('destroy', () => undo());

            return undo;
        });
    }

    private scrollNotificationList(delta: number) {
        const vadj = this.calendarMessageList?._scrollView?.get_vadjustment();
        if (vadj) {
            vadj.value -= delta;
        }
    }
}


/**
 * A helper to handle the abstractable parts of notification gestures, i.e. connecting to raw events of
 * an arbitrary [Clutter.Actor] and translating them into actor position translations (move to follow the
 * users' finger) and, upon gesture finishing, user intents (activate, close, expand, collapse, ...)
 */
class SwipeGesturesHelper {
    // Mid-gesture callbacks:
    private readonly onMoveHorizontally?: (x: number) => void;
    private readonly onMoveVertically?: (y: number) => void;
    private readonly onScrollScrollView?: (deltaY: number) => void;

    // Gesture finished callbacks:
    private readonly onActivate?: () => SwipeGesturesHelperCallbackFinishedResult;
    private readonly onClose?: (swipeDirection: 'left' | 'right') => SwipeGesturesHelperCallbackFinishedResult;
    private readonly onExpand?: () => SwipeGesturesHelperCallbackFinishedResult;
    private readonly onCollapse?: () => SwipeGesturesHelperCallbackFinishedResult;
    private readonly onEaseBackPosition?: () => void;

    private readonly actor: Ref<St.Widget>;
    private readonly scrollView?: St.ScrollView;
    private readonly gesture: Clutter.PanGesture;
    readonly recognizer: GestureRecognizer;
    private readonly smoothFollower: SmoothFollower<[SmoothFollowerLane]>;
    private signalIds: number[];

    /**
     * Whether the gesture currently being performed is a scroll gesture. This is set to `true` when the
     * [onScrollScrollView] callback has been called at least once during the current gesture.
     */
    private isScrollGesture: boolean = false;


    constructor(props: {
        actor: St.Widget,
        scrollView?: St.ScrollView,

        // Mid-gesture callbacks:
        onMoveHorizontally?: (x: number) => void,
        onMoveVertically?: (y: number) => void,
        onScrollScrollView?: (deltaY: number) => void,

        // Gesture finished callbacks:
        onActivate?: () => SwipeGesturesHelperCallbackFinishedResult,
        onClose?: (swipeDirection: 'left' | 'right') => SwipeGesturesHelperCallbackFinishedResult,
        onExpand?: () => SwipeGesturesHelperCallbackFinishedResult,
        onCollapse?: () => SwipeGesturesHelperCallbackFinishedResult,
        onEaseBackPosition?: () => void,
    }) {
        this.actor = new Ref(props.actor);
        this.scrollView = props.scrollView;

        this.onMoveHorizontally = props.onMoveHorizontally;
        this.onMoveVertically = props.onMoveVertically;
        this.onScrollScrollView = props.onScrollScrollView;

        this.onActivate = props.onActivate;
        this.onClose = props.onClose;
        this.onExpand = props.onExpand;
        this.onCollapse = props.onCollapse;
        this.onEaseBackPosition = props.onEaseBackPosition || this._defaultOnEaseBackPosition;

        this.smoothFollower = new SmoothFollower([
            new SmoothFollowerLane({
                onUpdate: value => this.onMoveHorizontally?.(value),
                smoothTime: 0.03,
            }),
        ]);

        // Track and recognize touch events:
        this.recognizer = new GestureRecognizer({
            onGestureStarted: () => {
                this.smoothFollower.start(lane => {
                    lane.currentValue = 0;
                });
            },
            onGestureProgress: state => this._onGestureProgress(state),
            onGestureEnded: state => {
                this.smoothFollower.stop();

                state.hasGestureBeenCanceled
                    ? this.onEaseBackPosition?.()
                    : this._executeFinishedGesture();

                this.isScrollGesture = false;
            },
        });

        this.gesture = this.recognizer.createPanGesture({
            maxNPoints: 1,
        });
        props.actor.add_action(this.gesture);

        // Ensure the notification remains its "active" background color while dragged.
        //
        // This is needed since the "active" pseudo class is removed by St already when the pointer/finger begins to
        // move, not when it is actually lifted/released from the notification. This would cause a brief
        // flickering of the active state background color when interacting with a notification via swipe gesture.
        this.signalIds = [
            props.actor.connect("touch-event", (actor, e: Clutter.Event) => {
                if (e.type() === Clutter.EventType.TOUCH_BEGIN)
                    actor.add_style_class_name("touchup-notification--touched")
                else if (e.type() === Clutter.EventType.TOUCH_END || e.type() === Clutter.EventType.TOUCH_CANCEL)
                    actor.remove_style_class_name("touchup-notification--touched");
            }),
            props.actor.connect("notify::hover", (actor) => {
                if (!actor.hover)
                    actor.remove_style_class_name("touchup-notification--touched");
            }),
        ];
    }

    private _onGestureProgress(state: GestureState) {
        if (state.firstMotionDirection?.axis === 'horizontal') {
            this.smoothFollower.update(lane => {
                lane.target = state.totalMotionDelta.x;
            });
        } else if (state.firstMotionDirection?.axis == 'vertical') {
            // Scroll the message list, if possible:
            const dy = state.currentMotionDelta.y;
            if (!state.startsWithHold && this.canScrollScrollView(dy > 0 ? 'up' : 'down')) {
                this.onScrollScrollView?.(dy);
                if (state.hasMovement) {
                    this.isScrollGesture = true;
                }
            } else {
                this.onMoveVertically?.(state.totalMotionDelta.y)
            }
        }
    }

    destroy() {
        this.actor.apply(actor => {
            this.signalIds.forEach((id) => actor.disconnect(id));
            actor.remove_action(this.gesture);
            actor.remove_style_class_name("touchup-notification--touched");
        })
    }

    private _executeFinishedGesture() {
        let defaultShouldEaseBack = false;
        let res: SwipeGesturesHelperCallbackFinishedResult = undefined;

        if (this.recognizer.currentState.isTap) {
            res = this.onActivate?.();
        } else {
            const lastMotion = this.recognizer.currentState.lastMotionDirection;
            if (lastMotion != null) {
                switch (lastMotion.direction) {
                    case 'up':
                        if (this.isScrollGesture)
                            break;
                        res = this.onCollapse?.();
                        defaultShouldEaseBack = true;
                        break;
                    case 'down':
                        if (this.isScrollGesture)
                            break;
                        res = this.onExpand?.();
                        defaultShouldEaseBack = true;
                        break;
                    default:
                        if (lastMotion.direction == 'right' && this.recognizer.currentState.totalMotionDelta.x > 0 ||
                            lastMotion.direction == 'left' && this.recognizer.currentState.totalMotionDelta.x < 0) {
                            res = this.onClose?.(lastMotion.direction);
                        } else {
                            defaultShouldEaseBack = true;
                        }
                }
            }
        }

        if (res?.easeBackPosition || (defaultShouldEaseBack && res?.easeBackPosition != false)) {
            this.onEaseBackPosition?.();
        }
    }

    private canScrollScrollView(direction: 'up' | 'down' | null = null): boolean {
        if (!this.scrollView?.get_vscrollbar_visible()) return false;

        const vadj = this.scrollView.get_vadjustment();
        switch (direction) {
            case 'up':
                return !!vadj && vadj.value > 0;
            case 'down':
                return !!vadj && vadj.value < vadj.upper - this.scrollView.contentBox.get_height();
        }

        return true;
    }

    private _defaultOnEaseBackPosition() {
        this.easeBackPositionOf(this.actor.current!);
    }

    public easeBackPositionOf(actor: Clutter.Actor) {
        actor.ease({
            translationX: 0,
            translationY: 0,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_BACK,
        });
    }
}

type SwipeGesturesHelperCallbackFinishedResult = {
    /**
     * Can be true, undefined or false, depending on which the "onEaseBackPosition" callback is invoked after this
     * callback.
     */
    easeBackPosition?: boolean
} | void;

