import * as Main from "resource:///org/gnome/shell/ui/main.js";

import ExtensionFeature from "$src/utils/extensionFeature";
import {PatchManager} from "$src/utils/patchManager";
import {GestureRecognizer, GestureRecognizerEvent} from "$src/utils/ui/gestureRecognizer";
import St from "gi://St";
import Clutter from "gi://Clutter";
import OverviewAndWorkspaceGestureController from "$src/utils/overviewAndWorkspaceGestureController";
import {Workspace} from "@girs/gnome-shell/ui/workspace";
import {WindowPreview} from "@girs/gnome-shell/ui/windowPreview";
import Graphene from "gi://Graphene";


export class OverviewGesturesFeature extends ExtensionFeature {
    private overviewActor: any;
    private controlsManagerLayout: any;
    private overviewAndWorkspaceController: OverviewAndWorkspaceGestureController;

    constructor(pm: PatchManager) {
        super(pm);

        this.overviewActor = Main.overview._overview;
        this.controlsManagerLayout = Main.overview._overview._controls.layout_manager;

        this.overviewAndWorkspaceController = new OverviewAndWorkspaceGestureController();

        this.setupBackgroundGestures();
        this.setupWindowGestures();
    }

    private setupBackgroundGestures() {
        const recognizer = new GestureRecognizer({
            scaleFactor: St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scaleFactor,
        });

        this.pm.patch(() => {
            Main.overview._overview._controls.reactive = true;
            return () => Main.overview._overview._controls.reactive = false;
        })
        this.pm.connectTo(Main.overview._overview._controls, 'touch-event', (_, e) => onEvent(e));

        const onEvent = (e: Clutter.Event) => {
            const state = recognizer.push(GestureRecognizerEvent.fromClutterEvent(e));

            if (state.isCertainlyMovement && state.isDuringGesture) {
                const d = state.totalMotionDelta;
                this.overviewAndWorkspaceController.gestureUpdate({
                    overviewProgress: state.firstMotionDirection?.axis === 'vertical'
                        ? -d.y / (this.overviewAndWorkspaceController.baseDistY * 0.35)
                        : undefined,
                    workspaceProgress: state.firstMotionDirection?.axis === 'horizontal'
                        ? -d.x / (this.overviewAndWorkspaceController.baseDistX * 0.62)
                        : undefined,
                });
            }

            if (state.hasGestureJustEnded) {
                this.overviewAndWorkspaceController.gestureEnd({
                    direction: state.firstMotionDirection?.axis === 'horizontal'
                        ? _oneOf(state.finalMotionDirection?.direction, ['left', 'right']) ?? null
                        : _oneOf(state.finalMotionDirection?.direction, ['up', 'down']) ?? null,
                });
            }
        }
    }

    private setupWindowGestures() {
        this.pm.appendToMethod(Workspace.prototype, '_addWindowClone', function(this: Workspace) {
            const newWindow = this._windows.at(-1)!;

            patchWindowPreview(newWindow);
        });

        const patchWindowPreview = (windowPreview: WindowPreview)=>  {
            const recognizer = new GestureRecognizer({
                scaleFactor: St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scaleFactor
            });

            let decidedOnGesture: 'drag' | 'swipe-vertically' | 'swipe-horizontally' | null = null;

            this.pm.connectTo(windowPreview, 'captured-event', (_, raw_event: Clutter.Event) => {
                if (!GestureRecognizerEvent.isTouch(raw_event)) {
                    return Clutter.EVENT_PROPAGATE;
                }

                const evt = GestureRecognizerEvent.fromClutterEvent(raw_event);
                const state = recognizer.push(evt);

                if (state.hasGestureJustStarted) {
                }

                if (state.isDuringGesture) {
                    if (decidedOnGesture === 'drag' || state.startsWithHold) {
                        if (decidedOnGesture !== 'drag') {
                            // @ts-ignore
                            windowPreview._draggable.startDrag(evt.x, evt.y, evt.time, raw_event.get_event_sequence(), raw_event.get_device());
                            decidedOnGesture = 'drag';
                        } else {
                            // @ts-ignore
                            windowPreview._draggable._updateDragPosition.call(windowPreview._draggable, raw_event);
                        }
                    } else if (decidedOnGesture === 'swipe-vertically' || state.isCertainlyMovement) {
                        if (state.firstMotionDirection?.axis === 'vertical') {
                            windowPreview.translationY = state.totalMotionDelta.y;
                            decidedOnGesture = 'swipe-vertically';
                        }
                    }
                    // TODO: implement 'swipe-horizontally'
                }

                if (state.hasGestureJustEnded) {
                    if (decidedOnGesture === 'drag') {
                        // @ts-ignore
                        windowPreview._onDragEnd();
                    } else if (decidedOnGesture === 'swipe-vertically') {
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
                                }
                            });
                        } else {
                            // @ts-ignore
                            windowPreview.ease({
                                translationY: 0,
                                duration: 150,
                                mode: Clutter.AnimationMode.EASE_OUT_BACK,
                            });
                        }
                    }
                    // TODO: implement 'swipe-horizontally'

                    decidedOnGesture = null;
                }

                return Clutter.EVENT_STOP;
            });
        }
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

