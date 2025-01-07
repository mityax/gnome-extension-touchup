import Meta from 'gi://Meta';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Clutter from "gi://Clutter";
import {CancellablePromise, Delay} from "$src/utils/delay.ts";
import GObject from "gi://GObject";
import {debugLog, repr} from "$src/utils/logging.ts";


export default class WindowPositionTracker {
    private _actorSignalIds: Map<GObject.Object, number[]> = new Map();
    private _windowSignalIds: Map<Meta.WindowActor, number[]> = new Map();
    private _updateDelay?: CancellablePromise<boolean | void>;
    private readonly callback: (windows: Meta.Window[]) => void;

    constructor(callback: (windows: Meta.Window[]) => void) {
        this.callback = callback;

        this._actorSignalIds.set(Main.overview, [
            Main.overview.connect('showing', this._update.bind(this)),
            Main.overview.connect('hiding', this._update.bind(this)),
            Main.overview.connect('shown', this._update.bind(this)),
            Main.overview.connect('hidden', this._update.bind(this)),
        ]);

        this._actorSignalIds.set(Main.sessionMode, [
            Main.sessionMode.connect('updated', this._update.bind(this))
        ]);

        for (const metaWindowActor of global.get_window_actors()) {
            this._onWindowActorAdded(metaWindowActor.get_parent()!, metaWindowActor);
        }

        this._actorSignalIds.set(global.windowGroup as Meta.WindowGroup, [
            global.windowGroup.connect('child-added', this._onWindowActorAdded.bind(this)),
            global.windowGroup.connect('child-removed', this._onWindowActorRemoved.bind(this))
        ]);

        // Use a delayed version of _updateTransparent to let the shell catch up
        this._actorSignalIds.set(global.windowManager, [
            global.windowManager.connect('switch-workspace', this._updateDelayed.bind(this))
        ]);

        this._update();
    }

    _onWindowActorAdded(container: Clutter.Actor, metaWindowActor: Meta.WindowActor) {
        this._windowSignalIds.set(metaWindowActor, [
            metaWindowActor.connect('notify::allocation', this._update.bind(this)),
            metaWindowActor.connect('notify::visible', this._update.bind(this))
        ]);
    }

    _onWindowActorRemoved(container: Clutter.Actor, metaWindowActor: Meta.WindowActor) {
        for (const signalId of this._windowSignalIds.get(metaWindowActor) ?? []) {
            metaWindowActor.disconnect(signalId);
        }
        this._windowSignalIds.delete(metaWindowActor);
        this._update();
    }

    _update() {
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
    }

    _updateDelayed() {
        this._updateDelay = Delay.ms(100).then(() => {
            this._update();
        });
    }

    destroy() {
        for (const actorSignalIds of [this._actorSignalIds, this._windowSignalIds]) {
            for (const [actor, signalIds] of actorSignalIds) {
                for (const signalId of signalIds) {
                    try {
                        actor.disconnect(signalId);
                    } catch (e) {
                        // Sometimes, the signalId is no longer connected to the actor; this happens for example
                        // when an actor is destroyed before the window tracker or when it is replaced due to some
                        // internals of the shell workings. In these cases, an error like this is thrown here:
                        //   Error: No signal connection 156 found
                        // We can safely ignore this, as it just means we don't have to disconnect the signal anymore
                        let msg = (
                            `An error occurred while trying to disconnect signal ${signalId} from ${repr(actor)} - ` +
                            "you can safely ignore this as it means that the signal is no longer connected anyways. " +
                            "This message is only here for debugging purposes (finding the exact cause as there" +
                            "could potentially be the need to re-connect the signal (e.g. if an important actor has" +
                            "been replaced earlier, causing this now)."
                        );
                        debugLog(msg);
                        DEBUG: throw Error(msg);
                    }
                }
            }
        }

        this._updateDelay?.cancel();
    }
};