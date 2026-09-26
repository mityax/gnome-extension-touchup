import ExtensionFeature from "$src/core/extensionFeature";
import {PatchManager} from "$src/core/patchManager";
import {GestureRecognizer, GestureRecognizerEvent} from "$src/utils/gestures/gestureRecognizer";
import Clutter from "gi://Clutter";
import * as Main from "resource:///org/gnome/shell/ui/main.js"
import {findAllActorsBy, SHELL_VERSION} from "$src/utils/shellUtils";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as BoxPointer from "resource:///org/gnome/shell/ui/boxpointer.js";
import {PopupMenu} from "resource:///org/gnome/shell/ui/popupMenu.js";
import {EdgeDragTransition, TransitionValues} from "$src/utils/ui/edgeDragTransition";
import {SmoothFollower, SmoothFollowerLane} from "$src/utils/gestures/smoothFollower";
import TouchUpExtension from "$src/extension";
import {DisablePanelDragService} from "$src/services/disablePanelDragService";
import {Ref} from "$src/utils/ui/widgets";
import {logger} from "$src/core/logging";
import St from "gi://St";
import {Panel} from "resource:///org/gnome/shell/ui/panel.js";


export class PanelMenusSwipeToOpenFeature extends ExtensionFeature {
    private currentTransition: EdgeDragTransition | null = null;
    private currentMenu: PanelMenu.Button | null = null;
    private smoothFollower: SmoothFollower<[SmoothFollowerLane]>;
    private isDuringOpenGesture: boolean = false;
    private subpm: PatchManager | null = null;

    constructor(pm: PatchManager) {
        super(pm);

        // Applies globally (via prototype) to all panel menus:
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

        TouchUpExtension.instance?.getFeature(DisablePanelDragService)?.inhibitPanelDrag();

        // Patch all existing panel menus:
        this._clearAndPatchAllMenus();

        // When a new panel menu is added (e.g. accessibility settings, or from another extension), undo everything
        // and re-patch to keep things simple:
        this.pm.appendToMethod(Panel.prototype, '_addToPanelBox', () => {
            this._clearAndPatchAllMenus();
        });
    }

    private _clearAndPatchAllMenus() {
        this.subpm?.destroy();
        this.subpm = this.pm.fork("subpm");

        // Collect all menus we support:
        const menus = this._collectMenus();

        // Setup the gestures:
        this._adjustClickGesturesForTouchEvents(menus);
        this._setupOpenGesture(menus);
        this._setupCloseGestures(menus);
    }

    private _setupOpenGesture(menus: PanelMenu.Button[]) {
        const menuRefs = menus.map(m => new Ref(m));

        const recognizer = new GestureRecognizer({
            onGestureStarted: state => {
                this.isDuringOpenGesture = true;

                const validMenus = menuRefs.map(m => m.current).filter(m => !!m);
                this.currentMenu = _findClosestMenu(validMenus, state.pressCoordinates.x);

                if (SHELL_VERSION >= [51]) {
                    // @ts-ignore: GNOME Shell >= v51 API, girs not yet available:
                    this.currentMenu!.menu.open({animate: false});
                } else {
                    this.currentMenu!.menu.open(BoxPointer.PopupAnimation.NONE);
                }

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
        const gesture = recognizer.createPanGesture({ panAxis: Clutter.PanAxis.Y });

        this.subpm!.patch(() => {
            Main.panel.add_action_full('touchup-panel-menus-swipe-to-open', Clutter.EventPhase.CAPTURE, gesture);
            return () => Main.panel.remove_action(gesture);
        });
    }

    private _setupCloseGestures(menus: PanelMenu.Button[]) {
        this.subpm!.patch(() => {
            menus.forEach(m => {
                const recognizer = new GestureRecognizer({
                    onGestureStarted: () => {
                        this.currentMenu = m;
                        if (SHELL_VERSION >= [51]) {
                            // @ts-ignore: GNOME Shell >= v51 API, girs not yet available:
                            this.currentMenu!.menu.open({animate: false});
                        } else {
                            this.currentMenu!.menu.open(BoxPointer.PopupAnimation.NONE);
                        }

                        // TODO: consider: this.currentMenu._onOpenStateChanged?.();
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

                // @ts-ignore: type hint for `_boxPointer` is missing in girs
                m.menu._boxPointer.add_action_full('touchup-panel-menus-swipe-to-close', Clutter.EventPhase.BUBBLE, gesture);
            });

            // @ts-ignore: type hint for `_boxPointer` is missing in girs
            const boxPointerRefs = menus.map(m => new Ref(m.menu._boxPointer));
            return () => {
                boxPointerRefs.forEach(bp => bp.take()?.remove_action_by_name('touchup-panel-menus-swipe-to-close'));
            };
        });

        // Teach all [St.ScrollView]'s pan gestures to not recognize if scrolling is currently not possible in
        // the direction the user intends to – this allows the panel menu close gesture to kick in instead; for
        // example, when the user swipes up the notification list in the panel while it is already scrolled to
        // the bottom, the menu would close instead:
        for (const m of menus) {
            // @ts-ignore: type hint for `_boxPointer` is missing in girs
            const scrollViews = findAllActorsBy(m.menu._boxPointer, (a) => {
                return a instanceof St.ScrollView && a.get_actions().length > 0;
            }) as St.ScrollView[];

            for (const scrollView of scrollViews) {
                this.subpm!.connectTo(scrollView.get_actions()[0], "may-recognize", () => {
                    const adj = scrollView.get_vadjustment();
                    const delta = (scrollView.get_actions()[0] as Clutter.PanGesture).get_accumulated_delta().get_y();

                    if (delta < 0) {
                        return adj.value < adj.upper - adj.pageSize;
                    } else {
                        return adj.value > adj.lower;
                    }
                });
            }
        }
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
     * Make all given [PanelMenu.Button]'s click gestures only react to pointer input, since these
     * gestures are configured to recognize on press, which would cancel our PanGesture immediately
     * on any interaction.
     *
     * As a second step, this function adds a new [Clutter.ClickGesture], that does not recognize
     * on press, to each menu button - this is to re-enable the classic behavior when not dragging,
     * but tapping the menu button via touch.
     */
    private _adjustClickGesturesForTouchEvents(menus: PanelMenu.Button[]) {
        for (const m of menus) {
            // Notice:
            // `PanelMenu.Button._clickGesture` is only available from Shell >= v50
            // -> https://github.com/GNOME/gnome-shell/commit/80bc9d773cc550e9ca448741ac174b54c61073b6
            // @ts-ignore
            if (!m._clickGesture) continue;

            // Step 01 - Make built-in click gesture (which recognizes on press) ignore touch input:
            this.subpm!.connectTo(
                // @ts-ignore
                m._clickGesture,
                "may-recognize",
                () => GestureRecognizerEvent.isPointer(Clutter.get_current_event()),
            );

            // Step 02 - Add another click gesture (that only recognizes on release) for touch interaction:
            this.subpm!.patch(() => {
                const gesture = new Clutter.ClickGesture();
                gesture.connect("recognize", () => m.menu.open());
                m.add_action_full("touchup-panel-menus-tap-gesture", Clutter.EventPhase.BUBBLE, gesture);
                const mRef = new Ref(m);
                return () => mRef.take()?.remove_action(gesture);
            });
        }
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
                    logger.debug("Preventing open-state-changed signal");
                    return;
                }

                if (signalName === 'open-state-changed') logger.debug("Allowing open-state-changed signal")

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
                if (SHELL_VERSION >= [51]) {
                    // @ts-ignore: GNOME Shell >= v51 API, girs not yet available:
                    this.currentMenu!.menu.close({animate: false});
                } else {
                    this.currentMenu!.menu.close(BoxPointer.PopupAnimation.NONE);
                }

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

    destroy() {
        TouchUpExtension.instance?.getFeature(DisablePanelDragService)?.uninhibitPanelDrag();
        super.destroy();
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
