import {GestureRecognizer} from "$src/utils/gestures/gestureRecognizer";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import Clutter from "gi://Clutter";
import {PatchManager} from "$src/core/patchManager";
import ExtensionFeature from "$src/core/extensionFeature";
import {SmoothNavigationGestureController} from "$src/utils/gestures/smoothNavigationGestureController";


export class OverviewBackgroundGesturesFeature extends ExtensionFeature {
    static readonly clutterGestureName = "touchup-overview-background-gesture";

    private readonly gesture: Clutter.PanGesture;
    private _navigationGestureController: SmoothNavigationGestureController;


    constructor(pm: PatchManager) {
        super(pm);

        this._navigationGestureController = new SmoothNavigationGestureController();

        const recognizer = new GestureRecognizer({
            onGestureStarted: _ => this._navigationGestureController.gestureBegin(),
            onGestureProgress: state => {
                const d = state.totalMotionDelta;
                this._navigationGestureController.gestureProgress(
                    -d.y / (this._navigationGestureController.overviewBaseDist * 0.25),
                    -d.x / (this._navigationGestureController.workspaceBaseDist * 0.62)
                );
            },
            onGestureCompleted: state => {
                this._navigationGestureController.gestureEnd(state.finalMotionDirection?.direction);
            },
            onGestureCanceled: _ => this._navigationGestureController.gestureCancel(),
        });

        this.gesture = recognizer.createPanGesture();

        this.pm.patch(() => {
            Main.overview._overview._controls.add_action_full(
                OverviewBackgroundGesturesFeature.clutterGestureName,
                Clutter.EventPhase.BUBBLE,
                this.gesture,
            );
            return () => Main.overview._overview._controls.remove_action(this.gesture);
        });
        this.pm.setProperty(Main.overview._overview._controls, 'reactive', true);
    }
    
    canNotCancel(otherGesture: Clutter.PanGesture) {
        this.gesture.can_not_cancel(otherGesture);
    }

    destroy() {
        this._navigationGestureController.destroy();
        super.destroy();
    }
}
