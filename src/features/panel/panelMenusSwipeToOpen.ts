import ExtensionFeature from "../../utils/extensionFeature";
import {PatchManager} from "$src/utils/patchManager";
import {GestureRecognizer} from "$src/utils/gestures/gestureRecognizer";
import Clutter from "gi://Clutter";
import * as Main from "resource:///org/gnome/shell/ui/main.js"
import {findAllActorsBy} from "$src/utils/utils";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as BoxPointer from "resource:///org/gnome/shell/ui/boxpointer.js";
import {PopupMenu} from "resource:///org/gnome/shell/ui/popupMenu.js";
import {EdgeDragTransition, TransitionValues} from "$src/utils/ui/edgeDragTransition";
import {SmoothFollower, SmoothFollowerLane} from "$src/utils/gestures/smoothFollower";


export class PanelMenusSwipeToOpenFeature extends ExtensionFeature {
    private currentTransition: EdgeDragTransition | null = null;
    private currentMenu: PanelMenu.Button | null = null;
    private smoothFollower: SmoothFollower<[SmoothFollowerLane]>;
    private isDuringOpenGesture: boolean = false;

    constructor(pm: PatchManager) {
        super(pm);

        // Collect all menus we support:
        const menus = this._collectMenus();

        // Setup menu patches:
        this._disableClickOnPress(menus);
        this._suppressOpenStateChangedSignalDuringOpenGesture();

        // Use a [SmoothFollower] for our gestures:
        this.smoothFollower = new SmoothFollower([
            new SmoothFollowerLane({
                smoothTime: 0.04,
                onUpdate: (value: number) => {
                    this._applyValues(this.currentTransition!.interpolate(value));
                }
            }),
        ]);

        // Setup the gestures:
        this._setupOpenGesture(menus);
        this._setupCloseGestures(menus);
    }

    private _setupOpenGesture(menus: PanelMenu.Button[]) {
        const recognizer = new GestureRecognizer({
            onGestureStarted: state => {
                this.isDuringOpenGesture = true;
                this.currentMenu = _findClosestMenu(menus, state.pressCoordinates.x);
                this.currentMenu!.menu.open(BoxPointer.PopupAnimation.NONE);
                this.currentTransition = new EdgeDragTransition({
                    fullExtent: this.currentBoxPointer?.get_preferred_height(-1)[1]!,
                });
                this._applyValues(this.currentTransition!.initialValues);
                this.smoothFollower.start(lane => lane.currentValue = 0);
            },
            onGestureProgress: state => {
                this.smoothFollower.update(lane => {
                    lane.target = state.totalMotionDelta.y;
                });
            },
            onGestureEnded: state => {
                this.smoothFollower.stop();
                this.isDuringOpenGesture = false;

                const duration = 150;
                const animatableExtent = this.currentTransition!.fullExtent - this.currentTransition!.initialExtent;
                const prog = Math.max(state.totalMotionDelta.y / animatableExtent, 0);

                if (state.lastMotionDirection?.direction === 'up' || state.hasGestureBeenCanceled) {
                    this._cancelOpeningMenu(duration * prog);
                } else {
                    this._finalizeOpeningMenu(duration * Math.abs(1 - prog));
                }
            },
        });

        // Setup our `Clutter.PanGesture` instance:
        const gesture = recognizer.createPanGesture({
            panAxis: Clutter.PanAxis.Y,
        });

        this.pm.patch(() => {
            Main.panel.add_action_full('touchup-panel-menus-swipe-to-open', Clutter.EventPhase.CAPTURE, gesture);
            return () => Main.panel.remove_action(gesture);
        });
    }


    private _setupCloseGestures(menus: PanelMenu.Button[]) {
        this.pm.patch(() => {
            menus.forEach(m => {
                const recognizer = new GestureRecognizer({
                    onGestureStarted: () => {
                        this.currentMenu = m;
                        this.currentMenu!.menu.open(BoxPointer.PopupAnimation.NONE);
                        this.currentTransition = new EdgeDragTransition({
                            fullExtent: this.currentBoxPointer?.get_preferred_height(-1)[1]!,
                        });
                        this.smoothFollower.start(lane => {
                            lane.currentValue = this.currentTransition!.fullExtent;
                        });
                    },
                    onGestureProgress: state => {
                        this.smoothFollower.update(lane => {
                            let prog = this.currentTransition!.fullExtent + state.totalMotionDelta.y;

                            if (state.totalMotionDelta.y < 0) {  // this is to prevent jumps when swiping downward on fully opened menu
                                prog -= this.currentTransition!.initialExtent;
                            }

                            lane.target = prog;
                        });
                    },
                    onGestureEnded: state => {
                        this.smoothFollower.stop();

                        if (state.lastMotionDirection?.direction === 'down' || state.hasGestureBeenCanceled) {
                            this._finalizeOpeningMenu();
                        } else {
                            this._cancelOpeningMenu();
                        }
                    },
                });

                const gesture = recognizer.createPanGesture({
                    panAxis: Clutter.PanAxis.Y,
                });

                // @ts-ignore
                m.menu._boxPointer.add_action_full('touchup-panel-menus-swipe-to-close', Clutter.EventPhase.BUBBLE, gesture);
            });
            return () => {
                // @ts-ignore
                menus.forEach(m => m.menu._boxPointer.remove_action_by_name('touchup-panel-menus-swipe-to-close'));
            };
        });
    }

    /**
     * Find all `PanelMenu.Button` instances with an attached `BoxPointer` dropdown menu
     */
    private _collectMenus() {
        return findAllActorsBy(
            Main.panel,
            actor => !!(
                actor instanceof PanelMenu.Button
                // @ts-ignore
                && actor.menu._boxPointer
            )
        ) as PanelMenu.Button[];
    }


    /**
     * Disable "recognize_on_press" on the panel menu buttons to allow dragging
     */
    private _disableClickOnPress(menus: PanelMenu.Button[]) {
        menus.forEach(m => {

            // Notice:
            // `PanelMenu.Button._clickGesture` is only available from Shell >= v50
            // -> https://github.com/GNOME/gnome-shell/commit/80bc9d773cc550e9ca448741ac174b54c61073b6
            // @ts-ignore
            if (!m._clickGesture) return;

            this.pm.setProperty(
                // @ts-ignore
                m._clickGesture as Clutter.ClickGesture,
                'recognize_on_press',
                false,
            );
        });
    }


    /**
     * Prevent emitting the "open-state-changed" event during the gesture to prevent grab. The
     * event is manually emitted after the gesture is completed.
     */
    private _suppressOpenStateChangedSignalDuringOpenGesture() {
        const self = this;
        this.pm.patchMethod(
            PopupMenu.prototype,
            'emit',
            function (this: PopupMenu, originalMethod, signalName, ...args) {
                if (this === self.currentMenu?.menu
                    && signalName === 'open-state-changed'
                    && self.isDuringOpenGesture) {
                    return;
                }

                originalMethod(signalName, ...args);
            },
        );
    }

    private get currentBoxPointer(): BoxPointer.BoxPointer | null {
        // @ts-ignore
        return this.currentMenu?.menu._boxPointer ?? null;
    }

    private _finalizeOpeningMenu(duration?: number) {
        this._easeToValues({
            target: this.currentTransition!.finalValues,
            duration: duration ?? 150,
            onStopped: () => {
                this.currentMenu!.menu.
                    // @ts-ignore
                    emit("open-state-changed", true);
            }
        });
    }

    private _cancelOpeningMenu(duration?: number) {
        this._easeToValues({
            target: this.currentTransition!.initialValues,
            duration: duration ?? 150,
            onStopped: () => {
                this.currentMenu!.menu.close(BoxPointer.PopupAnimation.NONE);

                // Reset values for the next time the menu is opened:
                this._applyValues(this.currentTransition!.finalValues);
            }
        });
    }

    private _easeToValues(props: {target: TransitionValues, duration: number, onStopped?: () => void}) {
        this.currentBoxPointer!.bin.ease({
            scaleY: props.target.scale,
            duration: props.duration,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        this.currentBoxPointer!.ease({
            translationY: props.target.translation,
            opacity: props.target.opacity,
            duration: props.duration,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: props.onStopped,
        });
    }

    private _applyValues(targetValues: TransitionValues) {
        this.currentBoxPointer!.translationY = targetValues.translation;
        this.currentBoxPointer!.opacity = targetValues.opacity;
        this.currentBoxPointer!.bin.scaleY = targetValues.scale;
    }
}


function _findClosestMenu<T extends Clutter.Actor>(menus: T[], x: number): T {
    let min = -1;
    let res = null;

    for (const menu of menus) {
        const extents = menu.get_transformed_extents();
        const d = Math.min(
            // Offset both bounds by 1px inward to prevent uncertainty when two menus' bounds fall on
            // the same pixel:
            Math.abs(extents.get_top_left().x  + 1  - x),
            Math.abs(extents.get_top_right().x - 1 - x),
        );
        if (d < min || res == null) {
            min = d;
            res = menu;
        }
    }

    return res ?? menus[0];
}
