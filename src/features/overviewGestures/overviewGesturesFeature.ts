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
import {GestureRecognizer, GestureRecognizerEvent} from "$src/utils/ui/gestureRecognizer";
import OverviewAndWorkspaceGestureController from "$src/utils/overviewAndWorkspaceGestureController";
import {Delay} from "$src/utils/delay";


export class OverviewGesturesFeature extends ExtensionFeature {
    private overviewAndWorkspaceController: OverviewAndWorkspaceGestureController;

    constructor(pm: PatchManager) {
        super(pm);

        this.overviewAndWorkspaceController = new OverviewAndWorkspaceGestureController();

        this._setupOverviewBackgroundGestures();
        this._setupDesktopBackgroundGestures();
        this._setupWindowPreviewGestures();
    }

    private _setupOverviewBackgroundGestures() {
        const recognizer = new GestureRecognizer({
            onGestureProgress: state => {
                if (state.hasMovement) {
                    const d = state.totalMotionDelta;
                    this.overviewAndWorkspaceController.gestureUpdate({
                        overviewProgress: -d.y / (this.overviewAndWorkspaceController.baseDistY * 0.25),
                        workspaceProgress: -d.x / (this.overviewAndWorkspaceController.baseDistX * 0.62),
                    });
                }
            },
            onGestureCompleted: state => {
                this.overviewAndWorkspaceController.gestureEnd({
                    direction: state.firstMotionDirection?.direction ?? null,
                });
            }
        });

        this.pm.patch(() => {
            Main.overview._overview._controls.reactive = true;
            return () => Main.overview._overview._controls.reactive = false;
        })
        this.pm.connectTo(Main.overview._overview._controls, 'touch-event', (_, e) => {
            recognizer.push(GestureRecognizerEvent.fromClutterEvent(e));
        });
    }

    private _setupWindowPreviewGestures() {
        this.pm.appendToMethod(Workspace.prototype, '_addWindowClone', function(this: Workspace) {
            patchWindowPreview(this._windows.at(-1)!);
        });

        const patchWindowPreview = (windowPreview: WindowPreview)=>  {
            let decidedOnGesture: 'drag' | 'swipe-up' | 'swipe-down' | 'swipe-horizontally' | null = null;

            const recognizer = new GestureRecognizer({
                onGestureCompleted: state => {
                    if (decidedOnGesture === 'drag') {
                        // @ts-ignore
                        windowPreview._onDragEnd();
                    } else if (decidedOnGesture === 'swipe-up') {
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
                        this.overviewAndWorkspaceController.gestureEnd({
                            direction: _oneOf(state.finalMotionDirection?.direction, ['left', 'right']) ?? null,
                        });
                    } else if (decidedOnGesture === 'swipe-down') {
                        this.overviewAndWorkspaceController.gestureEnd({
                            direction: _oneOf(state.finalMotionDirection?.direction, ['up', 'down']) ?? null,
                        });
                    } else if (state.isTap) {
                        // @ts-ignore
                        windowPreview._activate();
                    }

                    decidedOnGesture = null;
                }
            });

            this.pm.connectTo(windowPreview, 'captured-event', (_, raw_event: Clutter.Event) => {
                if (!GestureRecognizerEvent.isTouch(raw_event)) {
                    return Clutter.EVENT_PROPAGATE;
                }

                const state = recognizer.push(GestureRecognizerEvent.fromClutterEvent(raw_event));

                if (state.isDuringGesture) {
                    if (decidedOnGesture === 'drag' || state.startsWithHold) {
                        if (decidedOnGesture !== 'drag') {
                            // @ts-ignore
                            windowPreview._draggable.startDrag(
                                ...raw_event.get_coords(),
                                raw_event.get_time_us(),
                                raw_event.get_event_sequence(),
                                raw_event.get_device(),
                            );
                            decidedOnGesture = 'drag';
                        } else {
                            // @ts-ignore
                            windowPreview._draggable._updateDragPosition.call(windowPreview._draggable, raw_event);
                        }
                    } else if (state.hasMovement) {
                        if (decidedOnGesture === 'swipe-up'
                            || state.firstMotionDirection?.direction === 'up') {
                            windowPreview.translationY = Math.min(0, state.totalMotionDelta.y);
                            decidedOnGesture = 'swipe-up';
                        } else if (decidedOnGesture === 'swipe-down'
                            || state.firstMotionDirection?.direction === 'down') {
                            this.overviewAndWorkspaceController.gestureUpdate({
                                overviewProgress: -state.totalMotionDelta.y / (
                                    this.overviewAndWorkspaceController.baseDistY * 0.35)
                            });
                            decidedOnGesture = 'swipe-down';
                        } else if (decidedOnGesture === 'swipe-horizontally'
                            || state.firstMotionDirection?.axis === 'horizontal') {
                            this.overviewAndWorkspaceController.gestureUpdate({
                                workspaceProgress: -state.totalMotionDelta.x / (
                                    this.overviewAndWorkspaceController.baseDistX * 0.62)
                            });
                            decidedOnGesture = 'swipe-horizontally';
                        }
                    }
                }

                return Clutter.EVENT_STOP;
            });
        }
    }

    private _setupDesktopBackgroundGestures() {
        const recognizer = new GestureRecognizer({
            onGestureProgress: state => {
                if (state.hasMovement) {
                    this.overviewAndWorkspaceController.gestureUpdate({
                        overviewProgress: -state.totalMotionDelta.y / (
                            this.overviewAndWorkspaceController.baseDistY * 0.25),
                        workspaceProgress: -state.totalMotionDelta.x / (
                            this.overviewAndWorkspaceController.baseDistX * 0.62),
                    });
                }
            },
            onGestureCompleted: state => {
                this.overviewAndWorkspaceController.gestureEnd({
                    direction: state.finalMotionDirection?.direction ?? null,
                });
            }
        });

        const patchBgManager = (bgManager: BackgroundManager) => {
            this.pm.setProperty(bgManager.backgroundActor, 'reactive', true);
            this.pm.connectTo(bgManager.backgroundActor, 'touch-event', (_, evt) => {
                recognizer.push(GestureRecognizerEvent.fromClutterEvent(evt));
            });
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
}



function _oneOf<T>(v: T, allowed: T[]): T | undefined
function _oneOf<T>(v: T, allowed: T[], orElse: T): T
function _oneOf<T>(v: T, allowed: T[], orElse?: T): T | undefined {
    if (allowed.includes(v)) return v;
    return orElse;
}

