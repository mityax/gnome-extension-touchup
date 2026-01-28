import ExtensionFeature from "../../utils/extensionFeature";
import {PatchManager} from "$src/utils/patchManager";
import {GestureRecognizer} from "$src/utils/gestures/gestureRecognizer";
import Clutter from "gi://Clutter";
import {logger} from "$src/utils/logging";
import * as Main from "resource:///org/gnome/shell/ui/main.js"
import {findAllActorsBy} from "$src/utils/utils";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as BoxPointer from "resource:///org/gnome/shell/ui/boxpointer.js";
import {PopupMenu} from "resource:///org/gnome/shell/ui/popupMenu.js";
import {EdgeDragTransition, TransitionValues} from "$src/utils/ui/edgeDragTransition";


export class PanelMenusSwipeToOpenFeature extends ExtensionFeature {
    private currentTransition: EdgeDragTransition | null = null;
    private currentMenu: PanelMenu.Button | null = null;

    constructor(pm: PatchManager) {
        super(pm);

        const menus = findAllActorsBy(
            Main.panel,
            actor => !!(
                actor instanceof PanelMenu.Button
                // @ts-ignore
                && actor.menu._boxPointer
            )
        ) as PanelMenu.Button[];

        menus.forEach(m => pm.setProperty(
            // @ts-ignore
            m._clickGesture as Clutter.ClickGesture,
            'recognize_on_press',
            false,
        ));

        const self = this;
        pm.patchMethod(
            PopupMenu.prototype,
            'emit',
            function (this: PopupMenu, originalMethod, signalName, ...args) {
                if (this === self.currentMenu?.menu
                    && signalName === 'open-state-changed'
                    && recognizer.currentState.isDuringGesture) {
                    // Prevent emitting the event during the gesture to prevent grab. The event is
                    // manually emitted after the gesture is completed.
                    return;
                }

                originalMethod(signalName, ...args);
            },
        );

        const recognizer = new GestureRecognizer({
            onGestureStarted: state => {
                try {
                    this.currentMenu = this._findClosestMenu(menus, state.pressCoordinates.x);
                    // @ts-ignore
                    const boxPointer = this.currentMenu!.menu._boxPointer as BoxPointer.BoxPointer;

                    this.currentTransition = new EdgeDragTransition({
                        fullExtent: boxPointer.get_transformed_size()[1],
                    });
                    logger.debug("Created currentTransition");

                    this.currentMenu!.menu.open(BoxPointer.PopupAnimation.NONE);

                    this._applyValues(this.currentTransition!.initialValues);
                } catch (e) {
                    logger.error(e);
                }
            },
            onGestureProgress: state => {
                logger.debug("Gesture progress");
                this._applyValues(this.currentTransition!.interpolate(state.totalMotionDelta.y));
            },
            onGestureEnded: state => {
                logger.debug("Gesture end");
                const duration = 150;
                const prog = Math.max(state.totalMotionDelta.y / (this.currentBoxPointer!.get_transformed_size()[1] - 200), 0);

                if (state.lastMotionDirection?.direction === 'up') {
                    this._cancelOpeningMenu(duration * prog);
                } else {
                    this._finalizeOpeningMenu(duration * Math.abs(1-prog));
                }
            }
        });

        const gesture = new Clutter.PanGesture({
            panAxis: Clutter.PanAxis.Y,
        });

        // Notice:
        // `PanelMenu.Button._clickGesture` is only available from Shell >= v50
        // -> https://github.com/GNOME/gnome-shell/commit/80bc9d773cc550e9ca448741ac174b54c61073b6
        // @ts-ignore
        menus.forEach(m => m._clickGesture.can_not_cancel(gesture));

        gesture.connect('pan-update', () => recognizer.push(Clutter.get_current_event()));
        gesture.connect('end', () => {
            recognizer.push(Clutter.get_current_event());
            recognizer.ensureEnded();
        });
        gesture.connect("cancel", () => recognizer.cancel());

        this.pm.patch(() => {
            Main.panel.add_action_full('touchup-panel-menus-swipe-to-open', Clutter.EventPhase.CAPTURE, gesture);
            return () => Main.panel.remove_action(gesture);
        });
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

    private _findClosestMenu<T extends Clutter.Actor>(menus: T[], x: number): T {
        let min = -1;
        let res = null;

        for (const menu of menus) {
            const extents = menu.get_transformed_extents();
            const d = Math.min(
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
}
