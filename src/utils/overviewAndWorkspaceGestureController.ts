import {clamp, UnknownClass} from "./utils";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import {IdleRunner} from "$src/utils/idleRunner";


export default class OverviewAndWorkspaceGestureController {
    private _monitorIndex?: number;

    private _baseDistX = 900;
    private _baseDistY: number = global.screenHeight;

    private _initialWorkspaceProgress = 0;
    private _initialOverviewProgress = 0;

    private _currentOverviewProgress = 0;
    private _currentWorkspaceProgress = 0;

    private _isOverviewGestureRunning = false;
    private _isWorkspaceGestureRunning = false;

    //@ts-ignore
    private _wsController: UnknownClass = Main.wm._workspaceAnimation;
    private _idleRunner?: IdleRunner;

    constructor(props?: {monitorIndex?: number}) {
        this._monitorIndex = props?.monitorIndex;
    }

    /**
     * This function is optional; if it has not been called before `gestureUpdate` the gesture
     * will begin automatically.
     */
    gestureBegin() {
        this.gestureUpdate({overviewProgress: 0, workspaceProgress: 0});
    }

    gestureUpdate(props: {overviewProgress?: number, workspaceProgress?: number}) {
        if (typeof props.overviewProgress !== 'undefined') {
            if (!this._isOverviewGestureRunning) {
                Main.overview._gestureBegin({
                    confirmSwipe: (baseDistance: number, points: number[], progress: number, cancelProgress: number) => {
                        this._baseDistY = baseDistance;

                        // The following tenary expression is needed to fix a bug (presumably in Gnome Shell's
                        // OverviewControls) that causes a `progress` of 1 to be passed to this callback on the first
                        // gesture begin, even though the overview is not visible:
                        this._initialOverviewProgress = Main.overview._visible ? progress : 0;
                        this._currentOverviewProgress = this._initialOverviewProgress;
                    }
                });

                this._isOverviewGestureRunning = true;
            } else {
                this._currentOverviewProgress = this._initialOverviewProgress + props.overviewProgress;
                Main.overview._gestureUpdate({}, this._currentOverviewProgress);
            }
        }

        if (typeof props.workspaceProgress !== 'undefined') {
            if (!this._isWorkspaceGestureRunning) {
                this._wsController._switchWorkspaceBegin({
                    confirmSwipe: (baseDistance: number, points: number[], progress: number, cancelProgress: number) => {
                        this._baseDistX = baseDistance;

                        this._initialWorkspaceProgress = progress;
                        this._currentWorkspaceProgress = this._initialWorkspaceProgress;
                    }
                }, this._monitorIndex ?? Main.layoutManager.primaryIndex);

                this._isWorkspaceGestureRunning = true;
            } else {
                this._currentWorkspaceProgress = this._initialWorkspaceProgress + props.workspaceProgress;
                this._wsController._switchWorkspaceUpdate({}, this._currentWorkspaceProgress);
            }
        }
    }

    gestureEnd(props: {direction: 'left' | 'right' | 'up' | 'down' | null}) {
        // Overview toggling:
        if (this._isOverviewGestureRunning) {
            if (props.direction === 'up') {  // `null` means user holds still at the end
                Main.overview._gestureEnd({}, 300, clamp(Math.round(this._currentOverviewProgress + 0.5), 1, 2));
            } else if (props.direction === 'down') {
                Main.overview._gestureEnd({}, 300, clamp(Math.round(this._currentOverviewProgress - 0.5), 0, 1));
            } else {
                Main.overview._gestureEnd({}, 300, clamp(Math.round(this._currentOverviewProgress), 0, 2));
            }
        }

        // Workspace switching:
        if (this._isWorkspaceGestureRunning) {
            if (props.direction === 'left' || props.direction === 'right') {
                this._wsController._switchWorkspaceEnd({}, 500, this._currentWorkspaceProgress + (props.direction == 'left' ? 0.5 : -0.5));
            } else {
                this._wsController._switchWorkspaceEnd({}, 500, Math.round(this._currentWorkspaceProgress));
            }
        }

        this._isOverviewGestureRunning = false;
        this._isWorkspaceGestureRunning = false;
    }

    gestureCancel() {
        this._wsController._switchWorkspaceEnd({}, 500, this._initialWorkspaceProgress);
        Main.overview._gestureEnd({}, 300, 0);

        this._isOverviewGestureRunning = false;
        this._isWorkspaceGestureRunning = false;
    }

    get monitorIndex(): number | null {
        return this._monitorIndex ?? null;
    }

    set monitorIndex(value: number | null) {
        this._monitorIndex = value ?? undefined;
    }

    get baseDistY(): number {
        return this._baseDistY;
    }

    get baseDistX(): number {
        return this._baseDistX;
    }

    get currentWorkspaceProgress(): number {
        return this._currentWorkspaceProgress;
    }

    get currentOverviewProgress(): number {
        return this._currentOverviewProgress;
    }

    get initialWorkspaceProgress(): number {
        return this._initialWorkspaceProgress;
    }

    get initialOverviewProgress(): number {
        return this._initialOverviewProgress;
    }
}

