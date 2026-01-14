import {GestureRecognizer} from "$src/utils/ui/gestureRecognizer";
import {oneOf} from "$src/utils/utils";
import {LayoutManager} from "resource:///org/gnome/shell/ui/layout.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import {PatchManager} from "$src/utils/patchManager";
import {OverviewGestureController, WorkspaceGestureController} from "$src/utils/overviewAndWorkspaceGestureController";
import Clutter from "gi://Clutter";
import ExtensionFeature from "$src/utils/extensionFeature";


export class DesktopBackgroundGesturesFeature extends ExtensionFeature {
    constructor(props: {
        pm: PatchManager,
        overviewController: OverviewGestureController,
        wsController: WorkspaceGestureController
    }) {
        super(props.pm);

        const recognizer = new GestureRecognizer({
            onGestureProgress: state => {
                props.overviewController.gestureProgress(
                    -state.totalMotionDelta.y / (props.overviewController.baseDist * 0.25));
                props.wsController.gestureProgress(
                    -state.totalMotionDelta.x / (props.wsController.baseDist * 0.62));
            },
            onGestureCompleted: state => {
                props.overviewController.gestureEnd(oneOf(state.finalMotionDirection?.direction, ['up', 'down']));
                props.wsController.gestureEnd(oneOf(state.finalMotionDirection?.direction, ['left', 'right']));
            },
            onGestureCanceled: state => {
                props.overviewController.gestureCancel();
                props.wsController.gestureCancel();
            }
        });

        const gesture = new Clutter.PanGesture({ max_n_points: 1 });
        gesture.connect('pan-update', () => recognizer.push(Clutter.get_current_event()));
        gesture.connect('end', () => recognizer.push(Clutter.get_current_event()));
        gesture.connect('cancel', () => recognizer.cancel())

        // @ts-ignore
        this.pm.setProperty(Main.layoutManager._backgroundGroup, 'reactive', true);
        this.pm.patch(() => {
            // @ts-ignore
            Main.layoutManager._backgroundGroup.add_action_full(
                'touchup-background-swipe-gesture',
                Clutter.EventPhase.BUBBLE,
                gesture,
            );
            // @ts-ignore
            return () => Main.layoutManager._backgroundGroup.remove_action(gesture);
        })

        // We have to overwrite the function responsible for updating the visibility of the several actors
        // managed by the Shell's [LayoutManager] during the overview-opening transition.
        // This is because the function hides the `window_group` actor of which the background actor, which
        // we listen to touch events on, is a descendent. When the actor is hidden however, it emits no touch
        // events anymore, which makes it impossible to continue the overview swipe gesture. As a trick to
        // circumvent this, we replace the line hiding that actor such that it instead sets it's opacity to
        // zero. The functions code otherwise remains unchanged.
        this.pm.patchMethod(LayoutManager.prototype, '_updateVisibility', function (this: LayoutManager, originalMethod, args) {
            let windowsVisible = Main.sessionMode.hasWindows && !this._inOverview;    // <-- original code

            if (recognizer.currentState.isDuringGesture) {               // <-- new
                global.window_group.opacity = windowsVisible ? 255 : 0;  // <-- new
            } else {                                                     // <-- new
                global.window_group.visible = windowsVisible;            // <-- original code
            }                                                            // <-- new

            global.top_window_group.visible = windowsVisible;                       // <-- original code
            this._trackedActors.forEach(this._updateActorVisibility.bind(this));    // <-- original code
        });

        // Once a gesture is finished, make sure to translate the opacity set above back to the
        // actor's `visible` boolean – such that we only apply the opacity trick during the gesture
        // and always have a clean, non-hacky state after the gesture has finished.
        recognizer.connect('gesture-ended', _ => {
            global.window_group.visible = global.window_group.opacity !== 0;
            global.window_group.opacity = 255;
        });
    }
}
