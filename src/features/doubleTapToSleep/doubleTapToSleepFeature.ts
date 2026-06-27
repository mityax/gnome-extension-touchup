import ExtensionFeature from "$src/core/extensionFeature";
import {PatchManager} from "$src/core/patchManager";
import Clutter from "gi://Clutter";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
// @ts-ignore: Type hints missing
import {UnlockDialog} from "resource:///org/gnome/shell/ui/unlockDialog.js";
import {GestureRecognizerEvent} from "$src/utils/gestures/gestureRecognizer";
import * as SystemActions from "resource:///org/gnome/shell/misc/systemActions.js";
import TouchUpExtension from "$src/extension";
import {DisablePanelDragService} from "$src/services/disablePanelDragService";
import {SessionMode} from "$src/core/extensionFeatureManager";
import {Delay} from "$src/utils/delay";
import {assert} from "$src/core/logging";


export class DoubleTapToSleepFeature extends ExtensionFeature {
    constructor(pm: PatchManager) {
        super(pm);

        const panelGesture = createDoubleTapGesture({ onActivate: () => this._sleep() });
        const desktopBackgroundGesture = createDoubleTapGesture({ onActivate: () => this._sleep() });
        const screenShieldGesture = createDoubleTapGesture({ onActivate: () => this._sleep() });

        this.pm.patch(() => {
            Main.panel.add_action_full(
                "touchup-double-tap-to-sleep-panel",
                Clutter.EventPhase.BUBBLE,
                panelGesture,
            );
            Main.layoutManager._backgroundGroup.add_action_full(
                "touchup-double-tap-to-sleep-desktop-background",
                Clutter.EventPhase.BUBBLE,
                desktopBackgroundGesture
            );
            Main.layoutManager.screenShieldGroup.add_action_full(
                "touchup-double-tab-to-sleep-screenshield",
                Clutter.EventPhase.CAPTURE,  // `CAPTURE` allows us to get precedence over the built-in click gesture
                screenShieldGesture,
            )

            return () => {
                Main.panel.remove_action(panelGesture);
                Main.layoutManager._backgroundGroup.remove_action(desktopBackgroundGesture);
                Main.layoutManager.screenShieldGroup.remove_action(screenShieldGesture);
            };
        });

        // Ensure the default ClickAction on the UnlockDialog cannot cancel our double-click gesture:
        this.pm.appendToMethod(UnlockDialog.prototype, "_init", function(this: UnlockDialog) {
            const action = this.get_actions().find((a: Clutter.Action) => a instanceof Clutter.ClickGesture);
            action?.can_not_cancel(screenShieldGesture);

            DEBUG: assert(!!action, "Could not find click action on UnlockDialog")
        });

        // Make the ScreenShield reactive:
        this.pm.setProperty(Main.layoutManager.screenShieldGroup, "reactive", true);

        // Disallow touch-dragging on the panel, since that would cancel our double-click gesture:
        TouchUpExtension.instance?.getFeature(DisablePanelDragService)?.inhibitPanelDrag();
    }

    private _sleep() {
        if (Main.sessionMode.currentMode !== SessionMode.unlockDialog) {
            const systemActions = SystemActions.getDefault();
            // @ts-ignore
            systemActions.activateLockScreen();
        } else {
            // Fade out the screen the same way the screenshield does automatically shortly after
            // locking the screen:
            Main.screenShield._lockScreenShown({
                fadeToBlack: true,
                animateFade: true,
            });

            Delay.ms(600).then(() => {
                // Ensure the screen is turned off entirely, not just black:
                Main.screenShield._setActive(false);
                Main.screenShield._setActive(true);
            });
        }
    }

    destroy() {
        TouchUpExtension.instance?.getFeature(DisablePanelDragService)?.uninhibitPanelDrag();
        super.destroy();
    }
}


/**
 * Creates a double-click gesture that only reacts to touch events
 * */
function createDoubleTapGesture(props: {onActivate: () => void, timeout?: number}): Clutter.ClickGesture {
    const gesture = new Clutter.ClickGesture({
        nClicksRequired: 2,
    });
    gesture.connect("may-recognize", () => GestureRecognizerEvent.isTouch(Clutter.get_current_event()));
    gesture.connect("recognize", () => props.onActivate());
    return gesture;
}

