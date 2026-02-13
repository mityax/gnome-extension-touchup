import ExtensionFeature from "$src/core/extensionFeature";
import {PatchManager} from "$src/core/patchManager";
import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import {GestureRecognizerEvent} from "$src/utils/gestures/gestureRecognizer";
import * as SystemActions from "resource:///org/gnome/shell/misc/systemActions.js";
import TouchUpExtension from "$src/extension";
import {DisablePanelDragService} from "$src/services/disablePanelDragService";
import {SessionMode} from "$src/core/extensionFeatureManager";


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

        this.pm.setProperty(Main.layoutManager.screenShieldGroup, "reactive", true);

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
            // Main.screenShield._setLocked(true);
        }

    }

    destroy() {
        TouchUpExtension.instance?.getFeature(DisablePanelDragService)?.uninhibitPanelDrag();
        super.destroy();
    }
}


function createDoubleTapGesture(props: {onActivate: () => void, timeout?: number}): Clutter.ClickGesture {
    const timeout = props.timeout ?? 250;  // in ms
    let lastClick: number = -1;

    const gesture = new Clutter.ClickGesture();

    gesture.connect("may-recognize", () => {
        return GestureRecognizerEvent.isTouch(Clutter.get_current_event());
    });

    gesture.connect("recognize", () => {
        const now = GLib.get_monotonic_time() / 1000; // convert to ms

        if (lastClick !== -1 && now - lastClick < timeout) {
            props.onActivate();
            lastClick = -1;
        } else {
            lastClick = now;
        }
    });

    return gesture;
}

