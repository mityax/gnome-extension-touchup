import ExtensionFeature from "../utils/extensionFeature";
import {Patch, PatchManager} from "../utils/patchManager";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import Clutter from "gi://Clutter";
import {GestureRecognizerEvent} from "../utils/gestures/gestureRecognizer";


/**
 * A small service which allows to suppress the panel's default behavior of allowing to
 * start window dragging by dragging from the panel, since this might interfere with
 * some extension features.
 *
 * The gesture is only suppressed, when initiated by touch interaction – pointer behavior
 * remains unchanged.
 */
export class DisablePanelDragService extends ExtensionFeature {
    private inhibitPanelDragCount = 0;
    private _patch: Patch;

    constructor(pm: PatchManager) {
        super(pm);

        const clickGesture = Main.panel.get_action("window-drag") as Clutter.ClickGesture | null;

        if (clickGesture === null) {  // For GNOME Shell < 50.0

            // LEGACY: This branch can be removed when dropping support for GNOME Shell < 50.0

            this._patch = pm.patchMethod(Main.panel, "_tryDragWindow", (originalMethod, event) => {
                if (GestureRecognizerEvent.isPointer(Clutter.get_current_event())) {
                    originalMethod(event);
                }
            });
            this._patch.disable();  // disable initially, since we did not just register the patch here

        } else {
            this._patch = pm.registerPatch(() => {
                const signalId = clickGesture.connect("may-recognize", () => {
                    return GestureRecognizerEvent.isPointer(Clutter.get_current_event());
                });
                return () => clickGesture.disconnect(signalId);
            });
        }
    }

    inhibitPanelDrag() {
        this.inhibitPanelDragCount++;

        this._patch.setEnabled(this.inhibitPanelDragCount > 0);
    }

    uninhibitPanelDrag() {
        this.inhibitPanelDragCount = Math.max(0, this.inhibitPanelDragCount - 1);

        this._patch.setEnabled(this.inhibitPanelDragCount > 0);
    }
}
