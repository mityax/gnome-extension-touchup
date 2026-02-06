import * as Main from "resource:///org/gnome/shell/ui/main.js";
import {OverviewGestureController, WorkspaceGestureController} from "./navigationGestureControllers";
import {SmoothFollower, SmoothFollowerLane} from "./smoothFollower";
import {oneOf} from "../utils";


/**
 * This class fuses an [OverviewGestureController] and a [WorkspaceGestureController] with
 * a [SmoothFollower] to provide a unified, two-dimensional navigation gesture controller
 * that smoothly follows the users gesture.
 *
 * Smooth following provides a better navigation experience since gestures are usually updated
 * at a lower rate than the screen refresh rate.
 */
export class SmoothNavigationGestureController {
    private readonly _overviewController: OverviewGestureController;
    private readonly _wsController: WorkspaceGestureController;

    private readonly _smoothFollower: SmoothFollower<[SmoothFollowerLane, SmoothFollowerLane]>;

    private _gesturesStarted: boolean = false;

    constructor() {
        this._overviewController = new OverviewGestureController();
        this._wsController = new WorkspaceGestureController({
            monitorIndex: Main.layoutManager.primaryIndex
        });

        // Use a [SmoothFollower] to make the gestures asynchronously follow the users finger:
        this._smoothFollower = new SmoothFollower([
            new SmoothFollowerLane({
                onUpdate: value =>
                    this._overviewController.gestureProgress(value - this._overviewController.initialProgress),
            }),
            new SmoothFollowerLane({
                onUpdate: value => this._wsController.gestureProgress(value - this._wsController.initialProgress),
            })
        ]);
    }


    gestureBegin() {
        if (!this._gesturesStarted) {
            this._gesturesStarted = true;
            this._startGestures();
        }
    }

    gestureProgress(overviewProgress: number, workspaceProgress: number) {
        if (!this._gesturesStarted) {
            this._gesturesStarted = true;
            this._startGestures();
        }

        this._smoothFollower.update((overviewLane, wsLane) => {
            overviewLane.target = this._overviewController.initialProgress + overviewProgress;
            wsLane.target = this._wsController.initialProgress + workspaceProgress;
        });

    }

    gestureEnd(direction?: 'up' | 'down' | 'right' | 'left' | null) {
        this._stopGestures();
        this._gesturesStarted = false;

        this._overviewController.gestureEnd(oneOf(direction, ['up', 'down']));
        this._wsController.gestureEnd(oneOf(direction, ['left', 'right']));
    }

    gestureCancel() {
        this._stopGestures();
        this._gesturesStarted = false;

        this._overviewController.gestureCancel();
        this._wsController.gestureCancel();
    }

    get overviewBaseDist(): number {
        return this._overviewController.baseDist;
    }

    get workspaceBaseDist(): number {
        return this._wsController.baseDist;
    }

    set monitorIndex(value: number) {
        this._wsController.monitorIndex = value;
    }

    get monitorIndex(): number {
        return this._wsController.monitorIndex;
    }

    private _startGestures() {
        this._overviewController.gestureBegin();
        this._wsController.gestureBegin();

        this._smoothFollower.start((overviewLane, wsLane) => {
            overviewLane.currentValue = this._overviewController.initialProgress;
            wsLane.currentValue = this._wsController.initialProgress;
        });
    }

    private _stopGestures() {
        this._smoothFollower.stop();
    }

    destroy() {
        this._smoothFollower.stop();
        this._overviewController.destroy();
        this._wsController.destroy();
    }
}
