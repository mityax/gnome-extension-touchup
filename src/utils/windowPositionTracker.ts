import Meta from 'gi://Meta';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Clutter from "gi://Clutter";
import {CancellablePromise, Delay} from "$src/utils/delay";


export default class WindowPositionTracker {
    private _updateDelay?: CancellablePromise<boolean | void>;
    private readonly callback: (windows: Meta.Window[]) => void;
    private _updateLock = false;

    constructor(callback: (windows: Meta.Window[]) => void) {
        this.callback = callback;

        Main.overview.connectObject('showing', this._update.bind(this), this);
        Main.overview.connectObject('hiding', this._update.bind(this), this);
        Main.overview.connectObject('shown', this._update.bind(this), this);
        Main.overview.connectObject('hidden', this._update.bind(this), this);

        Main.sessionMode.connectObject('updated', this._update.bind(this), this);

        for (const metaWindowActor of global.get_window_actors()) {
            this._onWindowActorAdded(metaWindowActor.get_parent()!, metaWindowActor);
        }

        // @ts-ignore
        global.windowGroup.connectObject('child-added', this._onWindowActorAdded.bind(this), this);
        // @ts-ignore
        global.windowGroup.connectObject('child-removed', this._onWindowActorRemoved.bind(this), this);

        // Use a delayed version of _update to let the shell catch up
        // @ts-ignore
        global.windowManager.connectObject('switch-workspace', this._delayedUpdate.bind(this), this);

        this._update();
    }

    _onWindowActorAdded(container: Clutter.Actor, metaWindowActor: Meta.WindowActor) {
        // @ts-ignore
        metaWindowActor.connectObject('notify::allocation', this._update.bind(this), this);
        // @ts-ignore
        metaWindowActor.connectObject('notify::visible', this._update.bind(this), this);
    }

    _onWindowActorRemoved(container: Clutter.Actor, metaWindowActor: Meta.WindowActor) {
        // @ts-ignore
        metaWindowActor.disconnectObject(this);
        this._update();
    }

    _update() {
        // Prevent concurrent runs of this function as the Shell will crash (for certain window types,
        // e.g. Fedora Media Writer):
        if (this._updateLock) return;
        this._updateLock = true;

        try {
            if (!Main.layoutManager.primaryMonitor) {
                return;
            }

            // Get all the windows in the active workspace that are in the primary monitor and visible.
            const workspaceManager = global.workspaceManager;
            const activeWorkspace = workspaceManager.get_active_workspace();
            const windows = activeWorkspace.list_windows().filter((metaWindow: Meta.Window) => {
                return metaWindow.is_on_primary_monitor()
                    && metaWindow.showing_on_its_workspace()
                    && !metaWindow.is_hidden()
                    && metaWindow.get_window_type() !== Meta.WindowType.DESKTOP
                    && !metaWindow.skipTaskbar;
            });

            this.callback(windows);
        } finally {
            this._updateLock = false;
        }
    }

    _delayedUpdate() {
        this._updateDelay = Delay.ms(100).then(() => {
            this._update();
        });
    }

    destroy() {
        Main.overview.disconnectObject(this);
        Main.sessionMode.disconnectObject(this);
        // @ts-ignore
        global.windowGroup.disconnectObject(this);
        // @ts-ignore
        global.windowManager.disconnectObject(this);
        // @ts-ignore
        global.windowGroup.get_children().forEach(child => child.disconnectObject(this));

        this._updateDelay?.cancel();
    }
};