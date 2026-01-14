import {GestureRecognizer} from "$src/utils/ui/gestureRecognizer";
import {OverviewGestureController, WorkspaceGestureController} from "$src/utils/overviewAndWorkspaceGestureController";
import {oneOf} from "$src/utils/utils";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import Clutter from "gi://Clutter";
import {PatchManager} from "$src/utils/patchManager";
import ExtensionFeature from "$src/utils/extensionFeature";


export class OverviewBackgroundGesturesFeature extends ExtensionFeature {
    static readonly clutterGestureName = "touchup-overview-background-gesture";

    private readonly gesture: Clutter.PanGesture;

    constructor(props: {
        pm: PatchManager,
        overviewController: OverviewGestureController,
        wsController: WorkspaceGestureController
    }) {
        super(props.pm);

        const recognizer = new GestureRecognizer({
            onGestureProgress: state => {
                const d = state.totalMotionDelta;
                props.overviewController.gestureProgress(-d.y / (props.overviewController.baseDist * 0.25));
                props.wsController.gestureProgress(-d.x / (props.wsController.baseDist * 0.62));
            },
            onGestureCompleted: state => {
                props.overviewController.gestureEnd(oneOf(state.finalMotionDirection?.direction, ['up', 'down']));
                props.wsController.gestureEnd(oneOf(state.finalMotionDirection?.direction, ['left', 'right']));
            },
            onGestureCanceled: _ => {
                props.overviewController.gestureCancel();
                props.wsController.gestureCancel();
            }
        });

        this.pm.setProperty(Main.overview._overview._controls, 'reactive', true);

        this.gesture = new Clutter.PanGesture({ max_n_points: 1 });
        this.gesture.connect('pan-update', () => recognizer.push(Clutter.get_current_event()));
        this.gesture.connect('end', () => recognizer.push(Clutter.get_current_event()));
        this.gesture.connect('cancel', () => recognizer.cancel())

        this.pm.patch(() => {
            Main.overview._overview._controls.add_action_full(
                OverviewBackgroundGesturesFeature.clutterGestureName,
                Clutter.EventPhase.BUBBLE,
                this.gesture,
            );
            return () => Main.overview._overview._controls.remove_action(this.gesture);
        });
    }
    
    canNotCancel(otherGesture: Clutter.PanGesture) {
        this.gesture.can_not_cancel(otherGesture);
    }
}
