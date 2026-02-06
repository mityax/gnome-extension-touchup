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
import {logger} from "$src/utils/logging";


export class PanelMenusSwipeToOpenFeature extends ExtensionFeature {
    private currentTransition: EdgeDragTransition | null = null;
    private currentMenu: PanelMenu.Button | null = null;
    private recognizer: GestureRecognizer;

    constructor(pm: PatchManager) {
        super(pm);

        // Collect all menus we support:
        const menus = this._collectMenus();

        // Setup menu patches:
        this._disableClickOnPress(menus);
        this._suppressOpenStateChangedSignalDuringGesture();

        // Use a [SmoothFollower] for our gestures:
        const smoothFollower = new SmoothFollower([
            new SmoothFollowerLane({
                smoothTime: 0.04,
                onUpdate: (value: number) => {
                    this._applyValues(this.currentTransition!.interpolate(value));
                }
            }),
        ]);

        // Setup the main [GestureRecognizer]:
        this.recognizer = new GestureRecognizer({
            onGestureStarted: state => {
                this.currentMenu = _findClosestMenu(menus, state.pressCoordinates.x);
                this.currentMenu!.menu.open(BoxPointer.PopupAnimation.NONE);
                this.currentTransition = new EdgeDragTransition({
                    fullExtent: this.currentBoxPointer?.get_preferred_height(-1)[1]!,
                });
                this._applyValues(this.currentTransition!.initialValues);
                smoothFollower.start(lane => lane.currentValue = 0);
            },
            onGestureProgress: state => {
                smoothFollower.update(lane => {
                    lane.target = state.totalMotionDelta.y;
                });
            },
            onGestureEnded: state => {
                smoothFollower.stop();

                const duration = 150;
                const animatableExtent = this.currentTransition!.fullExtent - this.currentTransition!.initialExtent;
                const prog = Math.max(state.totalMotionDelta.y / animatableExtent, 0);

                if (state.lastMotionDirection?.direction === 'up' || state.hasGestureBeenCanceled) {
                    this._cancelOpeningMenu(duration * prog);
                } else {
                    this._finalizeOpeningMenu(duration * Math.abs(1-prog));
                }
            },
        });

        // Setup our `Clutter.PanGesture` instance:
        const gesture = new Clutter.PanGesture({
            panAxis: Clutter.PanAxis.Y,
        });
        gesture.connect('pan-update', () => this.recognizer.push(Clutter.get_current_event()));
        gesture.connect('end', () => {
            this.recognizer.push(Clutter.get_current_event());
            this.recognizer.ensureEnded();
        });
        gesture.connect("cancel", () => this.recognizer.cancel());

        this.pm.patch(() => {
            Main.panel.add_action_full('touchup-panel-menus-swipe-to-open', Clutter.EventPhase.CAPTURE, gesture);
            return () => Main.panel.remove_action(gesture);
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
    private _suppressOpenStateChangedSignalDuringGesture() {
        const self = this;
        this.pm.patchMethod(
            PopupMenu.prototype,
            'emit',
            function (this: PopupMenu, originalMethod, signalName, ...args) {
                if (this === self.currentMenu?.menu
                    && signalName === 'open-state-changed'
                    && self.recognizer.currentState.isDuringGesture) {
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

    private _finalizeOpeningMenu(duration: number) {
        this._easeToValues({
            target: this.currentTransition!.finalValues,
            duration,
            onStopped: () => {
                this.currentMenu!.menu.
                    // @ts-ignore
                    emit("open-state-changed", true);
            }
        });
    }

    private _cancelOpeningMenu(duration: number) {
        this._easeToValues({
            target: this.currentTransition!.initialValues,
            duration,
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
