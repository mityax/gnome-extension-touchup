//@ts-ignore
import * as Keyboard from 'resource:///org/gnome/shell/ui/keyboard.js';
import St from "gi://St";
import Clutter from "gi://Clutter";

import ExtensionFeature from "../../core/extensionFeature";
import {PatchManager} from "$src/core/patchManager";
import {GestureRecognizer, GestureRecognizerEvent} from "$src/utils/gestures/gestureRecognizer";
import {settings} from "$src/settings";
import {findAllActorsBy} from "$src/utils/utils";
import Graphene from "gi://Graphene";
import {isKeyboardKey} from "$src/features/osk/_oskUtils";


/** Maximum distance around a key that's still pressable */
const KEY_PRESS_MAX_DISTANCE = 75;  // in logical pixels


export class OSKGesturesFeature extends ExtensionFeature {
    constructor(pm: PatchManager, keyboard: Keyboard.Keyboard | null) {
        super(pm);

        if (keyboard) {
            this.onNewKeyboard(keyboard);
        }
    }

    public onNewKeyboard(keyboard: Keyboard.Keyboard) {
        const recognizer = new GestureRecognizer({
            onGestureProgress: state => {
                if (
                    settings.osk.gestures.swipeToClose.enabled.get()
                    && state.hasStrongMovement
                    && state.firstMotionDirection?.direction === 'down'
                ) {
                    keyboard.gestureProgress(keyboard.height - state.totalMotionDelta.y);
                }
            },
            onGestureEnded: state => {
                if (
                    settings.osk.gestures.swipeToClose.enabled.get()
                    && state.hasStrongMovement
                    && state.firstMotionDirection?.direction === 'down'
                    && state.lastMotionDirection?.direction === 'down'
                ) {
                    keyboard.gestureCancel();
                } else if (
                    settings.osk.gestures.swipeToClose.enabled.get()
                    && keyboard._gestureInProgress
                ) {
                    // The following line is a required hack to make the keyboard animate back up; since the
                    // keyboard's gesture functionality is only intended for opening the keyboard, not for closing,
                    // let alone canceling closing it. Thus, when the swipe-to-close gesture is cancelled, we tell the
                    // keyboard it's not open yet, which perfectly imitates the state it'd be in had we opened it
                    // using the gesture as normal instead of swipe-closing and then cancelling.
                    keyboard._keyboardVisible = false;

                    keyboard.gestureActivate();
                }
            },
        });

        let currentKey: Keyboard.Key | null = null;

        const onEvent = (evt: Clutter.Event) => {
            const state = recognizer.push(GestureRecognizerEvent.fromClutterEvent(evt));

            if (state.hasGestureJustStarted && settings.osk.gestures.extendKeys.enabled.get()) {
                const actor = this._selectReactiveChild(keyboard, state.pressCoordinates);

                if (actor?.get_parent() && isKeyboardKey(actor.get_parent()!)) {
                    currentKey = actor.get_parent();
                }

                if (
                    currentKey
                    && !currentKey.keyButton.get_transformed_extents().contains_point(new Graphene.Point(state.pressCoordinates))
                ) {
                    // @ts-ignore
                    currentKey?.keyButton.emit("touch-event", evt);
                }
            } else if (state.hasStrongMovement) {
                // Cancel keypress:
                if (currentKey) {
                    // @ts-ignore
                    currentKey._pressed = false;  // this prevents the key from being activated
                    currentKey.cancel();  // this is used by the shell when swiping the emoji pager to cancel keypress; basically exactly what we want here
                    currentKey = null;
                }
            } else if (state.hasGestureJustEnded) {
                if (
                    currentKey
                    && !currentKey.keyButton.get_transformed_extents().contains_point(new Graphene.Point(state.pressCoordinates))
                ) {
                    currentKey?.keyButton.emit("touch-event", evt);
                }

                currentKey = null;
            }
        }

        // We have to capture events since the OSK keys listen raw touch events instead of using Clutters new
        // gesture system:
        this.pm.connectTo(keyboard, 'captured-event', (_, evt: Clutter.Event) => {
            if (!GestureRecognizerEvent.isTouch(evt)) {
                return Clutter.EVENT_PROPAGATE;
            }

            onEvent(evt);
            return Clutter.EVENT_PROPAGATE; // Clutter.EVENT_STOP;
        });
    }

    /**
     * Returns the reactive actor on the keyboard that is closest to the given position, unless the position
     * is more than [KEY_PRESS_MAX_DISTANCE] off the key.
     */
    private _selectReactiveChild(keyboard: Keyboard.Keyboard & Clutter.Actor, point: { x: number; y: number }): Clutter.Actor | null {
        const maxDist = KEY_PRESS_MAX_DISTANCE * St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scaleFactor;
        const graphenePoint = new Graphene.Point(point);

        const candidates = findAllActorsBy(
            keyboard,
            (a) => a.mapped && a.reactive,
        );

        const hitActor = candidates.find(
            key => key
                .get_transformed_extents()
                .contains_point(graphenePoint),
        );

        if (hitActor) return hitActor;

        const nearest = candidates.reduce((a, b) => {
            const distA = a.get_transformed_extents().get_center().distance(graphenePoint)[0];
            const distB = b.get_transformed_extents().get_center().distance(graphenePoint)[0];

            return distA < distB ? a : b;
        });

        if (nearest.get_transformed_extents().get_center().distance(graphenePoint)[0] > maxDist) {
            return null;
        }

        return nearest ?? null;
    }
}
