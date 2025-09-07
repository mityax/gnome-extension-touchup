import St from "gi://St";
import Clutter from "gi://Clutter";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import {Workspace} from "resource:///org/gnome/shell/ui/workspace.js";
import {WindowPreview} from "resource:///org/gnome/shell/ui/windowPreview.js";
import Graphene from "gi://Graphene";
import {BackgroundManager} from "resource:///org/gnome/shell/ui/background.js";
import {LayoutManager} from "resource:///org/gnome/shell/ui/layout.js";

import ExtensionFeature from "$src/utils/extensionFeature";
import {PatchManager} from "$src/utils/patchManager";
import {GestureRecognizer} from "$src/utils/ui/gestureRecognizer";
import {OverviewGestureController, WorkspaceGestureController} from "$src/utils/overviewAndWorkspaceGestureController";
import {Delay} from "$src/utils/delay";
import {oneOf} from "$src/utils/utils";


export class OverviewGesturesFeature extends ExtensionFeature {
    private _overviewController: OverviewGestureController;
    private _wsController: WorkspaceGestureController;

    constructor(pm: PatchManager) {
        super(pm);

        this._overviewController = new OverviewGestureController();
        this._wsController = new WorkspaceGestureController({
            monitorIndex: Main.layoutManager.primaryIndex
        });

        this._setupOverviewBackgroundGestures();
        this._setupDesktopBackgroundGestures();
        this._setupWindowPreviewGestures();
    }

    private _setupOverviewBackgroundGestures() {
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
                this._overviewController.gestureEnd(oneOf(state.firstMotionDirection?.direction, ['up', 'down']));
                this._wsController.gestureEnd(oneOf(state.firstMotionDirection?.direction, ['left', 'right']));
            }
        });

        this.pm.setProperty(Main.overview._overview._controls, 'reactive', true);

        const gesture = new Clutter.PanGesture({ max_n_points: 1 });
        gesture.connect('pan-update', () => recognizer.push(Clutter.get_current_event()));
        gesture.connect('end', () => recognizer.push(Clutter.get_current_event()));
        gesture.connect('cancel', () => recognizer.push(Clutter.get_current_event()))

        this.pm.patch(() => {
            Main.overview._overview._controls.add_action(gesture);
            return () => Main.overview._overview._controls.remove_action(gesture);
        });
    }

    private _setupWindowPreviewGestures() {
        this.pm.appendToMethod(Workspace.prototype, '_addWindowClone', function(this: Workspace) {
            patchWindowPreview(this._windows.at(-1)!);
        });

        const patchWindowPreview = (windowPreview: WindowPreview)=>  {
            // Set a 'timeout_threshold' (the time the user needs to hold still before dragging is
            // initiated) on the windowPreview's DndStartGesture, to allow our own gesture to run:
            // @ts-ignore
            this.pm.setProperty(windowPreview._draggable._dndGesture, 'timeout_threshold', 500);

            // Construct our PanGesture:
            const gesture = new Clutter.PanGesture({ max_n_points: 1 });
            gesture.connect('pan-update', () => recognizer.push(Clutter.get_current_event()));
            gesture.connect('end', () => recognizer.push(Clutter.get_current_event()));
            gesture.connect('cancel', () => recognizer.push(Clutter.get_current_event()));

            this.pm.patch(() => {
                windowPreview.add_action_full('pan', Clutter.EventPhase.CAPTURE, gesture);
                return () => windowPreview.remove_action(gesture);
            });

            let decidedOnGesture: 'swipe-up' | 'swipe-down' | 'swipe-horizontally' | null = null;
            const recognizer = new GestureRecognizer({
                onGestureProgress: (state) => {
                    if (state.hasMovement) {
                        if (decidedOnGesture === 'swipe-up'
                            || state.firstMotionDirection?.direction === 'up') {
                            windowPreview.translationY = Math.min(0, state.totalMotionDelta.y);
                            decidedOnGesture = 'swipe-up';
                        } else if (decidedOnGesture === 'swipe-down'
                            || state.firstMotionDirection?.direction === 'down') {
                            this._overviewController.gestureProgress(
                                -state.totalMotionDelta.y / (this._overviewController.baseDist * 0.35));
                            decidedOnGesture = 'swipe-down';
                        } else if (decidedOnGesture === 'swipe-horizontally'
                            || state.firstMotionDirection?.axis === 'horizontal') {
                            this._wsController.gestureProgress(
                                -state.totalMotionDelta.x / (this._wsController.baseDist * 0.62));
                            decidedOnGesture = 'swipe-horizontally';
                        }
                    }
                },
                onGestureCompleted: state => {
                    if (decidedOnGesture === 'swipe-up') {
                        if (state.finalMotionDirection?.direction === 'up') {
                            windowPreview.pivotPoint = new Graphene.Point({x: 0.5, y: 0});
                            // @ts-ignore
                            windowPreview.ease({
                                translationY: windowPreview.translationY - 120 * this._scaleFactor,
                                opacity: 0,
                                scaleX: 0.95,
                                scaleY: 0.95,
                                duration: 100,
                                mode: Clutter.AnimationMode.EASE_OUT,
                                onComplete: () => {
                                    // @ts-ignore
                                    windowPreview._deleteAll();  // same as `windowPreview._closeButton.emit('click')`

                                    // If the window has not been marked as destroyed after a short delay, undo all
                                    // transformations and ease the preview back into view:
                                    Delay.ms(10).then(() => {
                                        // @ts-ignore
                                        if (!windowPreview._destroyed) {
                                            // @ts-ignore
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
                            // @ts-ignore
                            windowPreview.ease({
                                translationY: 0,
                                duration: 150,
                                mode: Clutter.AnimationMode.EASE_OUT_BACK,
                            });
                        }
                    } else if (decidedOnGesture === 'swipe-horizontally') {
                        this._wsController.gestureEnd(
                            oneOf(state.finalMotionDirection?.direction, ['left', 'right']));
                        this._overviewController.gestureCancel();
                    } else if (decidedOnGesture === 'swipe-down') {
                        this._overviewController.gestureEnd(
                            oneOf(state.finalMotionDirection?.direction, ['up', 'down']));
                        this._wsController.gestureCancel();
                    } else if (state.isTap) {
                        // @ts-ignore
                        windowPreview._activate();
                    }

                    decidedOnGesture = null;
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
                this._overviewController.gestureEnd(oneOf(state.finalMotionDirection?.direction, ['up', 'down']));
                this._wsController.gestureEnd(oneOf(state.finalMotionDirection?.direction, ['left', 'right']));
            }
        });

        const patchBgManager = (bgManager: BackgroundManager) => {
            if (bgManager.backgroundActor?.get_action('touchup-background-swipe-gestures')) {
                return;
            }

            this.pm.setProperty(bgManager.backgroundActor, 'reactive', true);

            const gesture = new Clutter.PanGesture({ max_n_points: 1 });
            gesture.connect('pan-update', () => recognizer.push(Clutter.get_current_event()));
            gesture.connect('end', () => recognizer.push(Clutter.get_current_event()));
            gesture.connect('cancel', () => recognizer.push(Clutter.get_current_event()))

            this.pm.patch(() => {
                bgManager.backgroundActor?.add_action_full(
                    'touchup-background-swipe-gestures',
                    Clutter.EventPhase.BUBBLE,
                    gesture,
                );
                return () => bgManager.backgroundActor?.remove_action(gesture);
            })
        }

        // @ts-ignore
        Main.layoutManager._bgManagers.forEach((m: BackgroundManager) => patchBgManager(m));

        this.pm.appendToMethod(LayoutManager.prototype, '_updateBackgrounds', function (this: LayoutManager) {
            // @ts-ignore
            this._bgManagers.forEach((m: BackgroundManager) => patchBgManager(m));
        });

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

