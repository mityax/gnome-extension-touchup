import {clamp, UnknownClass} from "$src/utils/utils";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import {logger} from "$src/utils/logging";


class ControllerCoordinator<T extends GestureController<any>> {
    private _focusLock: T | null = null;
    private readonly _allControllers: Set<T> = new Set();

    add(controller: T): void {
        this._allControllers.add(controller);
    }

    remove(controller: T): void {
        this._allControllers.delete(controller);
    }

    acquireFocus(controller: T) {
        this._focusLock = controller;
    }

    maybeAcquireFocus(controller: T) {
        if (this._focusLock === controller) {
            return true;
        }

        if (!this._focusLock || !this._focusLock.isGestureRunning) {
            this.acquireFocus(controller);
            return true;
        }
    }

    isTheOnlyRunningGesture(controller: T): boolean {
        for (const c of this._allControllers) {
            if (c.isGestureRunning && c !== controller) {
                return false;
            }
        }
        return true;
    }

    get hasControllers(): boolean {
        return this._allControllers.size > 0;
    }
}


abstract class GestureController<D extends ('left' | 'right' | 'up' | 'down')[]> {
    private static readonly _coordinators = new Map<typeof GestureController, ControllerCoordinator<any>>();
    private readonly _klass: typeof GestureController;

    private _isGestureRunning = false;

    protected abstract _doBegin(): void;
    protected abstract _doProgress(progress: number): void;
    protected abstract _doEnd(direction: D[0] | null): void;
    protected abstract _doCancel(): void;

    protected constructor(klass: typeof GestureController) {
        this._klass = klass;

        if (!GestureController._coordinators.has(klass)) {
            GestureController._coordinators.set(klass, new ControllerCoordinator());
        }

        this._coordinator.add(this);
    }

    gestureBegin() {
        this.gestureProgress(0);
    }

    gestureProgress(progress: number) {
        if (this._coordinator.maybeAcquireFocus(this)) {
            if (!this._isGestureRunning) {
                this._doBegin();
            } else {
                this._doProgress(progress);
            }
        }

        this._isGestureRunning = true;
    }

    gestureEnd(direction?: D[0] | null) {
        if (this._coordinator.isTheOnlyRunningGesture(this) && this._isGestureRunning) {
            this._doEnd(direction ?? null);
        }
        this._isGestureRunning = false;
    }

    gestureCancel() {
        if (this._coordinator.isTheOnlyRunningGesture(this) && this._isGestureRunning) {
            this._doCancel();
        }
        this._isGestureRunning = false;
    }

    get isGestureRunning() {
        return this._isGestureRunning;
    }

    get _coordinator() {
        return GestureController._coordinators.get(this._klass)!;
    }

    destroy() {
        this._coordinator.remove(this);

        if (!this._coordinator.hasControllers) {
            GestureController._coordinators.delete(this._klass)
        }
    }
}


export class OverviewGestureController extends GestureController<['up' | 'down']> {
    private _baseDist: number = global.screenHeight;
    private _initialProgress = 0;
    private _currentProgress = 0;
    private _cancelProgress = 0;

    constructor() {
        super(OverviewGestureController);
    }

    protected _doBegin() {
        Main.overview._gestureBegin({
            confirmSwipe: (baseDistance: number, points: number[], progress: number, cancelProgress: number) => {
                this._baseDist = baseDistance;

                // TODO: check if this is still the case:
                // The following tenary expression is needed to fix a bug (presumably in Gnome Shell's
                // OverviewControls) that causes a `progress` of 1 to be passed to this callback on the first
                // gesture begin, even though the overview is not visible:
                this._initialProgress = progress; // overviewVisible ? Math.max(1, progress) : 0;
                this._currentProgress = this._initialProgress;
                this._cancelProgress = cancelProgress;
            }
        });
    }

    protected _doProgress(progress: number) {
        this._currentProgress = this._initialProgress + progress;
        Main.overview._gestureUpdate({}, this._currentProgress);
    }

    protected _doEnd(direction: 'up' | 'down' | null) {
        try {
            if (this.isGestureRunning) {
                if (direction === 'up') {
                    Main.overview._gestureEnd(null, 300, clamp(Math.round(this._currentProgress + 0.5), 1, 2));
                } else if (direction === 'down') {
                    Main.overview._gestureEnd(null, 300, clamp(Math.round(this._currentProgress - 0.5), 0, 1));
                } else {
                    Main.overview._gestureEnd(null, 300, clamp(Math.round(this._currentProgress), 0, 2));
                }
            }
        } catch (e: any) {
            DEBUG: {
                if (!e.toString().includes('Invalid overview shown transition from HIDDEN to HIDING')) {
                    logger.error("Error during overview gesture termination: ", e);
                    throw e;
                } else {
                    logger.debug("(Expected) error during terminating overview gesture: ", e);
                }
            }
        }
    }

    protected _doCancel() {
        Main.overview._gestureEnd(null, 300, this._cancelProgress);
    }

    get baseDist() {
        return this._baseDist;
    }

    get initialProgress() {
        return this._initialProgress;
    }

    get currentProgress() {
        return this._currentProgress;
    }
}



export class WorkspaceGestureController extends GestureController<['left' | 'right']> {
    //@ts-ignore
    private _wsController: UnknownClass = Main.wm._workspaceAnimation;

    private _monitorIndex: number;
    private _baseDist: number = 900;
    private _initialProgress = 0;
    private _currentProgress = 0;
    private _cancelProgress = 0;

    constructor(props: {monitorIndex: number}) {
        // @ts-ignore
        super(WorkspaceGestureController);
        this._monitorIndex = props.monitorIndex;
    }

    protected _doBegin() {
        this._wsController._switchWorkspaceBegin({
            confirmSwipe: (baseDistance: number, points: number[], progress: number, cancelProgress: number) => {
                this._baseDist = baseDistance;

                this._initialProgress = progress;
                this._currentProgress = this._initialProgress;
                this._cancelProgress = cancelProgress;
            }
        }, this._monitorIndex ?? Main.layoutManager.primaryIndex);
    }

    protected _doProgress(progress: number) {
        this._currentProgress = this._initialProgress + progress;
        this._wsController._switchWorkspaceUpdate({}, this._currentProgress);
    }

    protected _doEnd(direction: 'left' | 'right' | null) {
        if (this.isGestureRunning) {
            // TODO: debug occasional cases of non-ending gesture

            if (direction === 'left' || direction === 'right') {
                this._wsController._switchWorkspaceEnd({}, 500, Math.round(this._currentProgress + (direction == 'left' ? 0.5 : -0.5)));
            } else {
                this._wsController._switchWorkspaceEnd({}, 500, Math.round(this._currentProgress));
            }
        }
    }

    protected _doCancel() {
        this._wsController._switchWorkspaceEnd({}, 500, this._cancelProgress);
    }

    get baseDist() {
        return this._baseDist;
    }

    get initialProgress() {
        return this._initialProgress;
    }

    get currentProgress() {
        return this._currentProgress;
    }

    get monitorIndex(): number {
        return this._monitorIndex;
    }

    set monitorIndex(value: number) {
        this._monitorIndex = value;
    }
}
