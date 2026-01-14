import {PatchManager} from "$src/utils/patchManager";
import {Workspace} from "resource:///org/gnome/shell/ui/workspace.js";
import type {WindowPreview} from "resource:///org/gnome/shell/ui/windowPreview.js";
import Clutter from "gi://Clutter";
import {GestureRecognizer, GestureRecognizerEvent} from "$src/utils/ui/gestureRecognizer";
import {Ref} from "$src/utils/ui/widgets";
import Graphene from "gi://Graphene";
import {Delay} from "$src/utils/delay";
import St from "gi://St";
import ExtensionFeature from "$src/utils/extensionFeature";
import {
    OverviewBackgroundGesturesFeature
} from "$src/features/backgroundNavigationGestures/_overviewBackgroundGestures";
import TouchUpExtension from "$src/extension";
import {
    BackgroundNavigationGesturesFeature
} from "$src/features/backgroundNavigationGestures/backgroundNavigationGesturesFeature";


export class WindowPreviewGestureFeature extends ExtensionFeature {
    constructor(pm: PatchManager) {
        super(pm);

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
            patchWindowPreview(this._windows.at(-1)! as WindowPreview & {_draggable: any});
        });

        const patchWindowPreview = (windowPreview: WindowPreview & {_draggable: {_dndGesture: any}})=>  {
            // Set a 'timeout_threshold' (the time the user needs to hold still before dragging is
            // initiated) on the windowPreview's DndStartGesture, to allow our own gesture to run:
            // @ts-ignore
            this.pm.setProperty(windowPreview._draggable._dndGesture, 'timeout_threshold', 500);

            // Ensure this gesture cooperates well with the overview gestures feature:
            TouchUpExtension.instance!
                .getFeature(BackgroundNavigationGesturesFeature)
                ?.getSubFeature(OverviewBackgroundGesturesFeature)
                ?.canNotCancel(windowPreview._draggable._dndGesture);

            // Construct our PanGesture:
            const gesture = new Clutter.PanGesture({ max_n_points: 1, panAxis: Clutter.PanAxis.Y });
            gesture.connect('pan-update', () => recognizer.push(Clutter.get_current_event()));
            gesture.connect('end', () => recognizer.push(Clutter.get_current_event()));
            gesture.connect('cancel', () => recognizer.cancel());
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
                    windowPreview.translationY = Math.min(0, state.totalMotionDelta.y);
                },
                onGestureCompleted: state => {
                    if (state.finalMotionDirection?.direction === 'up') {
                        this._onCloseWindow(windowPreview);
                    } else {
                        this._easeBackWindowPreview(windowPreview);
                    }
                },
                onGestureCanceled: _ => this._easeBackWindowPreview(windowPreview),
            });
        }
    }

    private _easeBackWindowPreview(windowPreview: WindowPreview) {
        windowPreview.ease({
            translationY: 0,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_BACK,
        });
    }

    private _onCloseWindow(windowPreview: WindowPreview) {
        const scaleFactor = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scaleFactor;

        windowPreview.pivotPoint = new Graphene.Point({x: 0.5, y: 0});
        windowPreview.ease({
            translationY: windowPreview.translationY - 120 * scaleFactor,
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
    }
}
