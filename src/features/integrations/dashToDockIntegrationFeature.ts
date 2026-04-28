import ExtensionFeature from "../../core/extensionFeature";
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import TouchUpExtension from "../../extension";
import {NavigationBarFeature} from "../navigationBar/navigationBarFeature";
import {Delay} from "$src/utils/delay";
import {ExtensionState} from "resource:///org/gnome/shell/misc/extensionUtils.js";
import GestureNavigationBar from "$src/features/navigationBar/widgets/gestureNavigationBar";
import St from "gi://St";
import {settings} from "$src/settings";
import {Patch, PatchManager} from "$src/core/patchManager";
import {GestureState} from "$src/utils/gestures/gestureRecognizer";
import {EdgeDragTransition} from "$src/utils/ui/edgeDragTransition";
import {SmoothFollower, SmoothFollowerLane} from "$src/utils/gestures/smoothFollower";


const SWIPE_UP_THRESHOLD = 40;  // in logical pixels (this also scaled by the `dash-to-dock-integration-overview-threshold-factor` setting – default: 2)
const DASH_TO_DOCK_EXT_UUID = 'dash-to-dock@micxgx.gmail.com';


// === Minimal DashToDock type stubs ===
type DashToDockExtModule = {
    dockManager?: {
        getDockByMonitor: (monitorIndex: number) => Dock,
        connect(signal: 'docks-ready', handler: () => void): number,
        disconnect(id: number): void,
    }
}

type Dock = {
    _show(): void,
    _hide(): void,
    _animateOut(duration: number, delay: number): void,
    get _slider(): { slideX: number },
    getDockState(): DockState,
    connect(signal: 'showing' | 'hiding', handler: () => void): number,
    disconnect(id: number): void,
} & St.Bin;

enum DockState {
    SHOWING = 1,
    SHOWN = 2,
}


export class DashToDockIntegrationFeature extends ExtensionFeature {
    private _extModule?: DashToDockExtModule;
    private _integration?: _DashToDockIntegration;

    async initialize() {
        const ext = Main.extensionManager.lookup(DASH_TO_DOCK_EXT_UUID);
        await this._onExtensionStateChanged(ext)

        this.pm.connectTo(Main.extensionManager, 'extension-state-changed', (_: any, ext) => {
            if (ext.uuid === DASH_TO_DOCK_EXT_UUID) {
                this._onExtensionStateChanged(ext);
            }
            return undefined;  // for ts only, type hints appear to require this (has no effect)
        });

        // Connect to NavigationBarFeature enabling/disabling, and to navigation bar changes (e.g. when changing mode)
        let navBarChangedConnectPatch: Patch;
        this.pm.connectTo(TouchUpExtension.instance!, 'feature-enabled', (f) => {
            if (f instanceof NavigationBarFeature) {
                navBarChangedConnectPatch = this.pm.connectTo(f, 'navigation-bar-changed', () => this._syncEnabled());
                this._syncEnabled();
            }
        });
        this.pm.connectTo(TouchUpExtension.instance!, 'feature-disabled', (name) => {
            if (name === 'navigation-bar') {
                this.pm.drop(navBarChangedConnectPatch);
                this._syncEnabled();
            }
        });
    }

    private _syncEnabled() {
        const navBar = TouchUpExtension.instance!.getFeature(NavigationBarFeature)?.currentNavBar;
        const dock = this._extModule?.dockManager!.getDockByMonitor(navBar?.monitor.index ?? 0);

        this._integration?.destroy();

        if (navBar instanceof GestureNavigationBar && dock) {
            this._integration = new _DashToDockIntegration(this.pm.fork('integration'), navBar, dock);
            const connectPatch = this.pm.connectTo(dock as any as St.Bin, 'destroy', () => {
                this._syncEnabled();
                this.pm.drop(connectPatch);
            });
        } else {
            this._integration = undefined;
        }
    }

    private async _onExtensionStateChanged(ext: any) {
        // @ts-ignore: ExtensionState.ACTIVE type hint is missing in girs
        if (ext?.state === ExtensionState.ACTIVE) {
            this._extModule ??= await import('file://' + ext.path! + '/extension.js');
        } else {
            this._extModule = undefined;
        }

        this._syncEnabled();
    }

    destroy() {
        super.destroy();
        this._integration?.destroy();
    }
}


class _DashToDockIntegration {
    readonly pm: PatchManager;
    readonly dock: Dock;
    private _swipeUpThresholdPatch: Patch;
    private _isDockInIntermediateState: boolean = false;
    private transition: EdgeDragTransition;
    private smoothFollower: SmoothFollower<SmoothFollowerLane[]>;

    constructor(pm: PatchManager, navBar: GestureNavigationBar, dock: Dock) {
        this.pm = pm;
        this.dock = dock;

        this._swipeUpThresholdPatch = this.pm.patch(() => {
            navBar.gestureManager.setSwipeUpThreshold(this._swipeUpThreshold);
            return () => {
                navBar.gestureManager.setSwipeUpThreshold(0);
            }
        });

        this.pm.connectTo(navBar.gestureManager, 'gesture-started', (state: GestureState) => this._onGestureStarted(state));
        this.pm.connectTo(navBar.gestureManager, 'gesture-progress', (state: GestureState) => this._onGestureProgress(state));
        this.pm.connectTo(navBar.gestureManager, 'gesture-ended', (state: GestureState) => this._onGestureEnded(state));

        // Enable swipe up threshold based on whether the dock is visible (the docks `showing` and `hiding` signals
        // are not always fired, thus we listen to method calls):
        const self = this;
        this.pm.appendToMethod(Object.getPrototypeOf(this.dock), ['_animateIn', '_animateOut'], function(this: Dock) {
            if (this === self.dock) {
                self._swipeUpThresholdPatch.setEnabled(!self._dockIsVisible || self._isDockInIntermediateState);
            }
        });

        this.transition = new EdgeDragTransition({
            fullExtent: this._swipeUpThreshold,  // TODO: base animation max distance on dock height, not swipe up threshold
            initialExtent: this._swipeUpThreshold / 2,
        });
        this.smoothFollower = new SmoothFollower([
            new SmoothFollowerLane({
                onUpdate: (motionDelta: number) => {
                    const val = this.transition.interpolate(motionDelta);
                    this.dock._slider.slideX = 1 + val.translation / this.transition.fullExtent;
                    this.dock.opacity = val.opacity;
                }
            })
        ]);
    }

    private get _dockIsVisible() {
        return [DockState.SHOWN, DockState.SHOWING].includes(this.dock.getDockState());
    }

    private get _swipeUpThreshold() {
        return SWIPE_UP_THRESHOLD
            * settings.integrations.dashToDock.gestureThresholdFactor.get()
            * St.ThemeContext.get_for_stage(global.stage).scaleFactor;
    }

    private _onGestureStarted(state: GestureState) {
        if (this._dockIsVisible) return;
        this.smoothFollower.start(lane => lane.currentValue = 0);
    }

    private _onGestureProgress(state: GestureState) {
        // If the dock is already fully shown, do nothing:
        if (this.dock.getDockState() === DockState.SHOWN) return;

        if (!this._dockIsVisible) {
            this.smoothFollower.update(lane => lane.target = -state.totalMotionDelta.y);
            this._isDockInIntermediateState = true;
        }
    }

    private _onGestureEnded(state: GestureState) {
        this.smoothFollower.stop()

        if (this._isDockInIntermediateState) {
            this._isDockInIntermediateState = false;

            if (state.lastMotionDirection?.direction === 'up' || Main.overview.visible) {
                this.dock._show();
                this.dock.ease({
                    opacity: 255,
                    duration: 100,
                });
            } else {
                this.dock._animateOut(0.1, 0);
                this.dock.ease({
                    opacity: 0,
                    duration: 100,
                    onStopped: () => this.dock.opacity = 255,
                });
            }
        }
    }

    /**
     * Show the dock, if it's not shown or showing already, and close it automatically after a delay.
     */
    private async _showDock() {
        const dockIsVisible = [DockState.SHOWN, DockState.SHOWING].includes(this.dock.getDockState());

        if (!dockIsVisible) {
            // Show the dock:
            this.dock._show();

            // After two seconds, hide the dock again:
            const delay = Delay.s(2, 'resolve').then(() => {
                hideConnectPatch.disable();
                this.pm!.drop(hideConnectPatch);

                if (!Main.overview.visible) {
                    this.dock._hide();
                }
            });

            // If the dock is hidden before the two seconds are over, cancel the hide delay to not cause
            // unexpected hiding later on:
            const hideConnectPatch = this.pm!.connectTo(this.dock, 'hiding', () => delay.cancel());
        }
    }

    destroy() {
        this.pm.destroy();
    }
}
