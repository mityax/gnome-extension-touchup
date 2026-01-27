import * as Main from "resource:///org/gnome/shell/ui/main.js";
import {overviewGestureMaxSpeed, workspaceGestureMaxSpeed} from "$src/config";
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

    private readonly _overviewLane: SmoothFollowerLane;
    private readonly _wsLane: SmoothFollowerLane;
    private readonly _smoothFollower: SmoothFollower;

    private _gesturesStarted: boolean = false;

    constructor() {
        this._overviewController = new OverviewGestureController();
        this._wsController = new WorkspaceGestureController({
            monitorIndex: Main.layoutManager.primaryIndex
        });

        // Use a [SmoothFollower] to make the gestures asynchronously follow the users finger:
        this._overviewLane = new SmoothFollowerLane({
            maxSpeed: overviewGestureMaxSpeed,  // per ms
            onUpdate: value =>
                this._overviewController.gestureProgress(value - this._overviewController.initialProgress),
        });
        this._wsLane = new SmoothFollowerLane({
            maxSpeed: workspaceGestureMaxSpeed, // per ms
            onUpdate: value => this._wsController.gestureProgress(value - this._wsController.initialProgress),
        });
        this._smoothFollower = new SmoothFollower([
            this._overviewLane,
            this._wsLane,
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
        this._overviewLane.target = this._overviewController.initialProgress + overviewProgress;
        this._wsLane.target = this._wsController.initialProgress + workspaceProgress;
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

        this._overviewLane.currentValue = this._overviewController.initialProgress;
        this._wsLane.currentValue = this._wsController.initialProgress;

        this._smoothFollower.start();
    }

    private _stopGestures() {
        this._smoothFollower.stop();

        this._overviewLane.currentValue = null;
        this._wsLane.currentValue = null;
    }

    destroy() {
        this._smoothFollower.stop();
        this._overviewController.destroy();
        this._wsController.destroy();
    }
}
