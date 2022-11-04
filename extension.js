const Clutter = imports.gi.Clutter;
const Config = imports.misc.config;
const Lang = imports.lang;
const Main = imports.ui.main;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const Signals = imports.signals;
const Utils = imports.misc.extensionUtils;

const Gettext = imports.gettext.domain('extendedgestures');
const _ = Gettext.gettext;
const Extension = imports.misc.extensionUtils.getCurrentExtension();
//const Convenience = Extension.imports.convenience;

// Our custom gesture handler instance
let gestureHandler = null;

// Our settings
let schema = null;

// Compatability settings
let versionSmaller330 = false;//Utils.versionCheck(["3.26", "3.28"], Config.PACKAGE_VERSION);

function init() {
    //schema = Convenience.getSettings();
}

const TouchGestureAction = new Lang.Class({
    Name: 'TouchGestureAction',

    _init: function(actor) {
        this._isCapturingTouchSequence = false;
        this._touchStart = {x: 0, y: 0};

        this._gestureCallbackID = actor.connect('touch-event', Lang.bind(this, this._handleEvent));
        //this._actionCallbackID = this.connect('activated', Lang.bind (this, this._doAction));
        //this._updateSettingsCallbackID = schema.connect('changed', Lang.bind(this, this._updateSettings));

        let seat = Clutter.get_default_backend().get_default_seat();
        this._virtualDevice = seat.create_virtual_device(Clutter.InputDeviceType.TOUCHPAD_DEVICE);
        log("actor.get_size(): " + actor.get_size());
    },

    _handleEvent: function(actor, event) {
        global.log("_handleEvent actor: " + actor + ", event: " + event + ", event type: " + event.type());
        print("_handleEvent actor: " + actor + ", event: " + event + ", event type: " + event.type());
    
        if (event.type() == Clutter.EventType.TOUCH_BEGIN) {
            log("event.get_position(): " + event.get_coords());
            log("actor.get_size(): " + actor.get_size());
            //if (event.get_position().y
            return Clutter.EVENT_PROPAGATE;
        }

        if (event.get_touchpad_gesture_finger_count() != 3)
            return Clutter.EVENT_PROPAGATE;

        if (event.get_gesture_phase() == Clutter.TouchpadGesturePhase.UPDATE) {
            let [dx, dy] = event.get_gesture_motion_delta();

            this._dx += dx;
            this._dy += dy;
        } else {
            if (event.get_gesture_phase() == Clutter.TouchpadGesturePhase.END)
                this._checkActivated(event.get_touchpad_gesture_finger_count());

            this._dx = 0;
            this._dy = 0;
        }

        return Clutter.EVENT_STOP;
    },

    _doAction: function (sender, dir, fingerCount) {
        let action = null;

        if (fingerCount == 3) {
            switch (dir) {
                case Meta.MotionDirection.LEFT:
                    action = this._leftThreeAction;
                    break;
                case Meta.MotionDirection.RIGHT:
                    action = this._rightThreeAction;
                    break;
                case Meta.MotionDirection.UP:
                    action = this._upThreeAction;
                    break;
                case Meta.MotionDirection.DOWN:
                    action = this._downThreeAction;
                    break;
                default:
                    break;
            }
        }

        if (action == null) {
            return;
        }

        switch (action) {
            case 0:
                Main.overview.toggle();
                break;
            case 1:
                Main.wm._switchApp();
                break;
            case 2:
                Main.overview.toggle();
                if (Main.overview._shown)
                    Main.overview.viewSelector._toggleAppsPage();
                break;
            case 3:
                if (dir == Meta.MotionDirection.LEFT) {
                    dir = Meta.MotionDirection.UP;
                } else if (dir == Meta.MotionDirection.RIGHT) {
                    dir = Meta.MotionDirection.DOWN;
                }
                this._switchWorkspace(sender, dir);
                break;
            case 4:
                const minimizedWindows = [];
                // gnome-shell >= 3.30 use workspace_manager instead of screen
                const activeWorkspace = versionSmaller330?
                    global.screen.get_active_workspace():global.workspace_manager.get_active_workspace();
                // loop through workspace windows
                Main.layoutManager._getWindowActorsForWorkspace(activeWorkspace).forEach( windowActor => {
                    const metaWindow = windowActor.get_meta_window();
                    // avoid minimizing always on top windows (Nautilus desktop and gnome shell for example)
                    if ( !metaWindow.is_on_all_workspaces() && metaWindow.showing_on_its_workspace()) {
                        minimizedWindows.push(metaWindow);
                        metaWindow.minimize();
                    }
                });
                //stash windows or restore previous stash
                if (minimizedWindows.length > 0) {
                    activeWorkspace.stashedWindows = minimizedWindows;
                } else if (activeWorkspace.stashedWindows != null) {
                    activeWorkspace.stashedWindows.forEach( window => window.activate(window));
                }
                break;
            case 5:
                // Nothing
                break;
            case 6:
                this._switchWorkspace(sender, Meta.MotionDirection.UP);
                break;
            case 7:
                this._switchWorkspace(sender, Meta.MotionDirection.DOWN);
                break;
            case 8:
                this._sendKeyEvent(Clutter.KEY_Forward);
                break;
            case 9:
                this._sendKeyEvent(Clutter.KEY_Back);
                break;
            case 10:
                let selector = Main.overview.viewSelector;
                selector._showAppsButton.checked ? Main.overview.toggle() : selector._toggleAppsPage();
                break;
            case 11:
                const focusedWindow = global.display.get_focus_window();
                if (focusedWindow.fullscreen) {
                    focusedWindow.unmake_fullscreen();
                }
                else {
                    focusedWindow.make_fullscreen();
                }
                break;
            default:
                break;
        }
    },

    _switchWorkspace: function (sender, dir) {
        // fix for gnome-shell >= 3.30
        if (!versionSmaller330) {
            let workspaceManager = global.workspace_manager;
            let activeWorkspace = workspaceManager.get_active_workspace();
            let newWs = activeWorkspace.get_neighbor(dir);
            Main.wm._prepareWorkspaceSwitch(activeWorkspace.index(), -1);
            Main.wm.actionMoveWorkspace(newWs);
        } else {
            Main.wm._actionSwitchWorkspace(sender, dir);
        }
    },

    _sendKeyEvent: function (...keys) {
        let currentTime = Clutter.get_current_event_time();
        keys.forEach(key => this._virtualDevice.notify_keyval(currentTime, key, Clutter.KeyState.PRESSED));
        keys.forEach(key => this._virtualDevice.notify_keyval(currentTime, key, Clutter.KeyState.RELEASED));
    },

    _checkSwipeValid: function (dir, fingerCount, motion) {
        const MOTION_THRESHOLD = 50;

        if (fingerCount == 3) {
            switch (dir) {
                case Meta.MotionDirection.LEFT:
                    return this._leftThreeEnabled && (motion > (50 - this._horizontalSensitivityAdjustment));
                case Meta.MotionDirection.RIGHT:
                    return this._rightThreeEnabled && (motion > (50 - this._horizontalSensitivityAdjustment));
                case Meta.MotionDirection.UP:
                    return this._upThreeEnabled && (motion > (50 - this._verticalSensitivityAdjustment));
                case Meta.MotionDirection.DOWN:
                    return this._downThreeEnabled && (motion > (50 - this._verticalSensitivityAdjustment));
                default:
                    break;
            }
        }

        return false;
    },

    _cleanup: function() {
        global.stage.disconnect(this._gestureCallbackID);
        this.disconnect(this._actionCallbackID);
    }
});

function enable() {
    Signals.addSignalMethods(TouchGestureAction.prototype);
    gestureHandler = new TouchGestureAction(global.stage);
}

function disable() {
    gestureHandler._cleanup();
    Main.wm._workspaceTracker._workspaces.forEach( ws => {
        delete ws.stashedWindows;
    });
}
