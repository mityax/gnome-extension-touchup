import St from "gi://St";
import Clutter from "gi://Clutter";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import {Workspace} from "resource:///org/gnome/shell/ui/workspace.js";
import {WindowPreview} from "resource:///org/gnome/shell/ui/windowPreview.js";
import Graphene from "gi://Graphene";
import {LayoutManager} from "resource:///org/gnome/shell/ui/layout.js";

import ExtensionFeature from "$src/utils/extensionFeature";
import {PatchManager} from "$src/utils/patchManager";
import {GestureRecognizer, GestureRecognizerEvent} from "$src/utils/ui/gestureRecognizer";
import {OverviewGestureController, WorkspaceGestureController} from "$src/utils/overviewAndWorkspaceGestureController";
import {Delay} from "$src/utils/delay";
import {oneOf} from "$src/utils/utils";
import {logger} from "$src/utils/logging";
import {Ref} from "$src/utils/ui/widgets";
import PanAxis = Clutter.PanAxis;


export class OverviewGesturesFeature extends ExtensionFeature {
    private _overviewController: OverviewGestureController;
    private _wsController: WorkspaceGestureController;
    private _overviewBackgroundGesture: Clutter.PanGesture;
    private _desktopBackgroundGesture: Clutter.PanGesture;

    constructor(pm: PatchManager) {
        super(pm);

        this._overviewController = new OverviewGestureController();
        this._wsController = new WorkspaceGestureController({
            monitorIndex: Main.layoutManager.primaryIndex
        });

        this._overviewBackgroundGesture = this._setupOverviewBackgroundGesture();
        this._desktopBackgroundGesture = this._setupDesktopBackgroundGestures();
        this._setupWindowPreviewGestures();
    }

    private _setupOverviewBackgroundGesture() {
        const recognizer = new GestureRecognizer({
            onGestureProgress: state => {
                if (state.hasMovement) {
                    const d = state.totalMotionDelta;
                    this._overviewController.gestureProgress(-d.y / (this._overviewController.baseDist * 0.25));
                    this._wsController.gestureProgress(-d.x / (this._wsController.baseDist * 0.62));
                } else {
                }
            },
            onGestureCompleted: state => {
                logger.debug(`Overview background gesture end`);
                this._overviewController.gestureEnd(oneOf(state.finalMotionDirection?.direction, ['up', 'down']));
                this._wsController.gestureEnd(oneOf(state.finalMotionDirection?.direction, ['left', 'right']));
            }
        });

        this.pm.setProperty(Main.overview._overview._controls, 'reactive', true);

        const gesture = new Clutter.PanGesture({ max_n_points: 1 });
        gesture.connect('pan-update', () => recognizer.push(Clutter.get_current_event()));
        gesture.connect('end', () => recognizer.push(Clutter.get_current_event()));
        gesture.connect('cancel', () => recognizer.push(Clutter.get_current_event()))

        this.pm.patch(() => {
            Main.overview._overview._controls.add_action_full('touchup-overview-background-gesture', Clutter.EventPhase.BUBBLE, gesture);
            return () => Main.overview._overview._controls.remove_action(gesture);
        });

        return gesture;
    }

    private _setupWindowPreviewGestures() {
        // FIXME: when swiping down a window preview, an error appears. This has something to do with the window preview
        //  attempting ot show its overlay (in its `vfunc_enter_event`), while being destroyed (via `_updateWorkspacesViews`):
        // The error does not appear to have any consequences.
        // Stack trace:
        // (gnome-shell:308033): Gjs-CRITICAL **: 09:47:04.572: JS ERROR: TypeError: this.window_container is null
        // _hasAttachedDialogs@resource:///org/gnome/shell/ui/windowPreview.js:459:9
        // _windowCanClose@resource:///org/gnome/shell/ui/windowPreview.js:256:22
        // showOverlay@resource:///org/gnome/shell/ui/windowPreview.js:328:29
        // vfunc_enter_event@resource:///org/gnome/shell/ui/windowPreview.js:562:14
        // removeWindow@resource:///org/gnome/shell/ui/workspace.js:854:29
        // addWindow/<.destroyId<@resource:///org/gnome/shell/ui/workspace.js:806:22
        // _updateWorkspacesViews@resource:///org/gnome/shell/ui/workspacesView.js:1032:38
        // prepareToEnterOverview@resource:///org/gnome/shell/ui/workspacesView.js:999:14
        // prepareToEnterOverview@resource:///org/gnome/shell/ui/overviewControls.js:710:33
        // gestureBegin@resource:///org/gnome/shell/ui/overviewControls.js:773:14
        // _gestureBegin@resource:///org/gnome/shell/ui/overview.js:362:33
        // _doBegin@file:///home/x/.local/share/gnome-shell/extensions/touchup@mityax/utils/overviewAndWorkspaceGestureController.js:86:23
        // gestureProgress@file:///home/x/.local/share/gnome-shell/extensions/touchup@mityax/utils/overviewAndWorkspaceGestureController.js:48:22
        // onGestureProgress@file:///home/x/.local/share/gnome-shell/extensions/touchup@mityax/features/overviewGestures/overviewGesturesFeature.js:79:54
        // emit/<@file:///home/x/.local/share/gnome-shell/extensions/touchup@mityax/utils/eventEmitter.js:7:55
        // emit@file:///home/x/.local/share/gnome-shell/extensions/touchup@mityax/utils/eventEmitter.js:7:33
        // push@file:///home/x/.local/share/gnome-shell/extensions/touchup@mityax/utils/ui/gestureRecognizer.js:123:22
        // _setupWindowPreviewGestures/patchWindowPreview/<@file:///home/x/.local/share/gnome-shell/extensions/touchup@mityax/features/overviewGestures/overviewGesturesFeature.js:61:60
        // @resource:///org/gnome/shell/ui/init.js:21:20

        this.pm.appendToMethod(Workspace.prototype, '_addWindowClone', function(this: Workspace) {
            patchWindowPreview(this._windows.at(-1)!);
        });

        const patchWindowPreview = (windowPreview: WindowPreview)=>  {
            // Set a 'timeout_threshold' (the time the user needs to hold still before dragging is
            // initiated) on the windowPreview's DndStartGesture, to allow our own gesture to run:
            // @ts-ignore
            this.pm.setProperty(windowPreview._draggable._dndGesture, 'timeout_threshold', 500);

            // @ts-ignore
            this._overviewBackgroundGesture.can_not_cancel(windowPreview._draggable._dndGesture);

            // Construct our PanGesture:
            const gesture = new Clutter.PanGesture({ max_n_points: 1, panAxis: PanAxis.Y });
            gesture.connect('pan-update', () => recognizer.push(Clutter.get_current_event()));
            gesture.connect('end', () => recognizer.push(Clutter.get_current_event()));
            gesture.connect('cancel', () => recognizer.push(Clutter.get_current_event()));
            gesture.connect('may-recognize', () => {
                return (
                    GestureRecognizerEvent.isTouch(gesture.get_point_event(0))  // only respond to touch gestures
                    && gesture.get_accumulated_delta().get_y() <= 0);  // only respond to swipe-down gestures
            });

            this.pm.patch(() => {
                windowPreview.add_action_full('touchup-window-preview-gesture', Clutter.EventPhase.CAPTURE, gesture);
                const ref = new Ref(windowPreview);  // use a ref to automatically unset once destroyed
                return () => ref.current?.remove_action(gesture);
            });

            const recognizer = new GestureRecognizer({
                onGestureProgress: (state) => {
                    if (state.hasMovement) {
                        windowPreview.translationY = Math.min(0, state.totalMotionDelta.y);
                    }
                },
                onGestureCompleted: state => {
                    if (state.finalMotionDirection?.direction === 'up') {
                        windowPreview.pivotPoint = new Graphene.Point({x: 0.5, y: 0});
                        windowPreview.ease({
                            translationY: windowPreview.translationY - 120 * this._scaleFactor,
                            opacity: 0,
                            scaleX: 0.95,
                            scaleY: 0.95,
                            duration: 100,
                            mode: Clutter.AnimationMode.EASE_OUT,
                            onStopped: () => {
                                // @ts-ignore
                                windowPreview._deleteAll();  // same as `windowPreview._closeButton.emit('click')`

                                // If the window has not been marked as destroyed after a short delay, undo all
                                // transformations and ease the preview back into view:
                                Delay.ms(10).then(() => {
                                    // @ts-ignore
                                    if (!windowPreview._destroyed) {
                                        windowPreview.ease({
                                            translationY: 0,
                                            opacity: 255,
                                            scaleX: 1,
                                            scaleY: 1,
                                            duration: 250,
                                            mode: Clutter.AnimationMode.EASE_OUT,
                                        });
                                    }
                                });
                            },
                        });
                    } else {
                        windowPreview.ease({
                            translationY: 0,
                            duration: 150,
                            mode: Clutter.AnimationMode.EASE_OUT_BACK,
                        });
                    }
                }
            });
        }
    }

    private _setupDesktopBackgroundGestures() {
        const recognizer = new GestureRecognizer({
            onGestureProgress: state => {
                if (state.hasMovement) {
                    this._overviewController.gestureProgress(
                        -state.totalMotionDelta.y / (this._overviewController.baseDist * 0.25));
                    this._wsController.gestureProgress(
                        -state.totalMotionDelta.x / (this._wsController.baseDist * 0.62));
                }
            },
            onGestureCompleted: state => {
                logger.debug(`Desktop background gesture end`);
                this._overviewController.gestureEnd(oneOf(state.finalMotionDirection?.direction, ['up', 'down']));
                this._wsController.gestureEnd(oneOf(state.finalMotionDirection?.direction, ['left', 'right']));
            }
        });

        const gesture = new Clutter.PanGesture({ max_n_points: 1 });
        gesture.connect('pan-update', () => recognizer.push(Clutter.get_current_event()));
        gesture.connect('end', () => recognizer.push(Clutter.get_current_event()));
        gesture.connect('cancel', () => recognizer.push(Clutter.get_current_event()))

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
        recognizer.connect('gesture-completed', _ => {
            global.window_group.visible = global.window_group.opacity !== 0;
            global.window_group.opacity = 255;
        });

        return gesture;
    }

    get _scaleFactor(): number {
        return St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scaleFactor;
    }

    destroy() {
        this._overviewController.destroy();
        this._wsController.destroy();
        super.destroy();
    }
}

