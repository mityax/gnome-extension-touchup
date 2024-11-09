import St from "@girs/st-15";
import WindowPositionTracker from "../../../utils/ui/windowPositionTracker";
import Meta from "@girs/meta-15";
import * as Main from '@girs/gnome-shell/ui/main';
import {Monitor} from "@girs/gnome-shell/ui/layout";
import Signal from "$src/utils/signal";
import {log} from "$src/utils/logging";


/**
 * Class that handles commons for all navigation bar types
 */
export default abstract class BaseNavigationBar<A extends St.Widget> {
    private readonly windowPositionTracker: WindowPositionTracker;
    declare private _monitor: Monitor;
    private _visible: boolean = false;
    private _reserveSpace: boolean = true;

    protected readonly actor: A;

    readonly onVisibilityChanged = new Signal<boolean>();
    readonly onReserveSpaceChanged = new Signal<boolean>();

    protected constructor({actor, reserveSpace}: {actor: A, reserveSpace: boolean}) {
        this.actor = actor;
        this._reserveSpace = reserveSpace;

        this.windowPositionTracker = new WindowPositionTracker(windows => {
            // Check if at least one window is near enough to the navigation bar:
            const top = this.actor.get_transformed_position()[1];
            const isWindowNear = windows.some((metaWindow: Meta.Window) => {
                const windowBottom = metaWindow.get_frame_rect().y + metaWindow.get_frame_rect().height;
                return windowBottom >= top;
            });

            if (this.actor.realized) {
                this.onIsWindowNearChanged(isWindowNear);
            } else {
                let id = this.actor.connect('realize', () => {
                    this.onIsWindowNearChanged(isWindowNear);
                    this.actor.disconnect(id);
                });
            }
        });
    }

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
    }

    hide() {
        if (!this.isVisible) return;

        this._removeActor();
        this._visible = false;
        this.onVisibilityChanged.emit(false);
    }

    setReserveSpace(reserveSpace: boolean) {
        if (reserveSpace != this._reserveSpace) {
            log(`Setting reserveSpace to ${reserveSpace}`);
            this._reserveSpace = reserveSpace;
            this._removeActor();
            this._addActor();
            this.onReserveSpaceChanged.emit(reserveSpace);
        }
    }

    reallocate() {
        // TODO: find touch-enabled monitor, keyword: ClutterInputDevice
        this._monitor = Main.layoutManager.primaryMonitor!;

        this.onBeforeReallocate();

        this.actor.set_position(this.monitor.x, this.monitor.y + this.monitor.height - this.actor.height);
        this.actor.set_width(this.monitor.width);
    }

    destroy() {
        this.actor.destroy();
        this.windowPositionTracker.destroy();
    }

    private _addActor() {
        Main.layoutManager.addChrome(this.actor, {
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
}
