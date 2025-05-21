import St from "gi://St";
import WindowPositionTracker from "$src/utils/ui/windowPositionTracker";
import Meta from "gi://Meta";
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Monitor} from "resource:///org/gnome/shell/ui/layout.js";
import Signal from "$src/utils/signal";


/**
 * Class that handles commons for all navigation bar types
 */
export default abstract class BaseNavigationBar<A extends St.Widget> {
    private windowPositionTracker?: WindowPositionTracker;
    declare private _monitor: Monitor;
    private _visible: boolean = false;
    private _reserveSpace: boolean = true;

    protected readonly actor: A;

    readonly onVisibilityChanged = new Signal<boolean>();
    readonly onReserveSpaceChanged = new Signal<boolean>();

    protected constructor({reserveSpace}: {reserveSpace: boolean}) {
        this._reserveSpace = reserveSpace;

        this.actor = this._buildActor();
    }

    /**
     * Build the main UI of the navigation bar.
     *
     * Note: This method is called during the class constructor (i.e. when subclases call `super()`).
     */
    protected abstract _buildActor(): A;

    get monitor(): Monitor {
        return this._monitor;
    }

    get isVisible(): boolean {
        return this._visible;
    }

    get reserveSpace(): boolean {
        return this._reserveSpace;
    }

    show() {
        if (this.isVisible) return;

        this._addActor();
        this._visible = true;
        this.onVisibilityChanged.emit(true);
        this.reallocate();
        this._createWindowPositionTracker();
    }

    hide() {
        if (!this.isVisible) return;

        this._removeActor();
        this.windowPositionTracker?.destroy();
        this.windowPositionTracker = undefined;

        this._visible = false;
        this.onVisibilityChanged.emit(false);
    }

    setMonitor(monitorIndex: number) {
        this._monitor = Main.layoutManager.monitors[monitorIndex];
        this.reallocate();
    }

    setReserveSpace(reserveSpace: boolean) {
        if (reserveSpace != this._reserveSpace) {
            this._reserveSpace = reserveSpace;
            this._removeActor();
            this._addActor();
            this.onReserveSpaceChanged.emit(reserveSpace);
        }
    }

    reallocate() {
        // FIXME: find touch-enabled monitor, keyword: ClutterInputDevice
        this._monitor ??= Main.layoutManager.primaryMonitor!;

        this.onBeforeReallocate();

        this.actor.set_position(this.monitor.x, this.monitor.y + this.monitor.height - this.actor.height);
        this.actor.set_width(this.monitor.width);
    }

    private _addActor() {
        Main.layoutManager.addTopChrome(this.actor, {
            affectsStruts: this.reserveSpace,
            trackFullscreen: true,
            affectsInputRegion: true,
        });
    }

    private _removeActor() {
        Main.layoutManager.removeChrome(this.actor);
    }

    protected abstract onIsWindowNearChanged(isWindowNear: boolean): void;

    protected onBeforeReallocate(): void {}

    private _createWindowPositionTracker() {
        let lastIsWindowNear = false;
        this.windowPositionTracker = new WindowPositionTracker(windows => {
            if (this.actor.realized) {
                // Check if at least one window is near enough to the navigation bar:
                const top = this.actor.get_transformed_position()[1];
                const isWindowNear = windows.some((metaWindow: Meta.Window) => {
                    const windowBottom = metaWindow.get_frame_rect().y + metaWindow.get_frame_rect().height;
                    return windowBottom >= top;
                });
                if (isWindowNear !== lastIsWindowNear) {
                    this.onIsWindowNearChanged(isWindowNear);
                }
                lastIsWindowNear = isWindowNear;
            }
        });
    }

    destroy() {
        this.actor.destroy();
        this.windowPositionTracker?.destroy();
    }
}
