import BaseNavigationBar from "./baseNavigationBar";
import St from "gi://St";
import {Widgets} from "$src/utils/ui/widgets";
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Graphene from "gi://Graphene";
import Clutter from "gi://Clutter";
import Meta from "gi://Meta";
import {settings} from "$src/settings.ts";
import {debugLog, log} from "$src/utils/logging.ts";
import ActorAlign = Clutter.ActorAlign;
import MotionDirection = Meta.MotionDirection;


export default class ButtonsNavigationBar extends BaseNavigationBar<St.BoxLayout> {
    private _virtualKeyboardDevice: Clutter.VirtualInputDevice;

    constructor() {
        super({ reserveSpace: true });

        let seat = Clutter.get_default_backend().get_default_seat();
        this._virtualKeyboardDevice = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    }

    protected _buildActor(): St.BoxLayout {
        return new Widgets.Row({
            name: 'gnometouch-navbar',
            styleClass: 'gnometouch-navbar bottom-panel',
            children: [
                // Left side:
                new Widgets.Row({
                    xExpand: false,
                    children: settings.navigationBar.buttonsLeft.get().map(b => this._buildButton(b as any)),
                }),
                // Center:
                new Widgets.Row({
                    xExpand: true,
                    xAlign: ActorAlign.CENTER,
                    children: settings.navigationBar.buttonsMiddle.get().map(b => this._buildButton(b as any)),
                }),
                // Right side:
                new Widgets.Row({
                    xExpand: false,
                    children: settings.navigationBar.buttonsRight.get().map(b => this._buildButton(b as any)),
                }),
            ]
        });
    }

    private moveToWorkspace(direction: 'left' | 'right') {
        const wm = global.workspaceManager;

        if (direction == 'left' && wm.get_active_workspace_index() == 0) return;
        if (direction == 'right' && wm.get_active_workspace_index() == wm.get_n_workspaces() - 1) return;

        const ws = wm.get_active_workspace().get_neighbor(direction == 'left' ? MotionDirection.LEFT : MotionDirection.RIGHT);

        if (!ws.active) {
            ws.activate(global.get_current_time());
        }
    }

    protected onIsWindowNearChanged(isWindowNear: boolean): void {
        if (isWindowNear && !Main.overview.visible) {
            // Make navbar opaque (black or white, based on shell theme brightness):
            this.actor.remove_style_class_name('gnometouch-navbar--transparent');
        } else {
            // Make navbar transparent:
            this.actor.add_style_class_name('gnometouch-navbar--transparent');
        }
    }

    private _buildButton(buttonType: 'keyboard' | 'workspace-previous' | 'workspace-next' | 'overview' | 'apps' | 'back' | 'spacer'): St.Widget {
        switch (buttonType) {
            case "keyboard":
                return new Widgets.Button({
                    name: 'gnometouch-navbar__osk-button',
                    styleClass: 'gnometouch-navbar__button',
                    iconName: 'input-keyboard-symbolic',
                    onClicked: () => {
                        try {
                            debugLog("keyboard: ", Main.keyboard);
                            // FIXME: "Couldn't open keyboard:  Error (TypeError: this.keyboardMonitor is undefined): this.keyboardMonitor is undefined"
                            // This doesn't help: Main.overview.keyboardIndex = this.monitor.index;
                            Main.keyboard?.open(this.monitor.index);
                        } catch (e) {
                            debugLog(`Couldn't open keyboard: `, e);
                        }
                    },
                });
            case "workspace-previous":
                return new Widgets.Button({
                    name: 'gnometouch-navbar__workspace-previous-button',
                    styleClass: 'gnometouch-navbar__button',
                    iconName: 'go-previous-symbolic',
                    onClicked: () => this.moveToWorkspace('left'),
                });
            case "workspace-next":
                return new Widgets.Button({
                    name: 'gnometouch-navbar__workspace-next-button',
                    styleClass: 'gnometouch-navbar__button',
                    iconName: 'go-next-symbolic',
                    onClicked: () => this.moveToWorkspace('right'),
                });
            case "overview":
                return new Widgets.Button({
                    name: 'gnometouch-navbar__overview-button',
                    styleClass: 'gnometouch-navbar__button',
                    iconName: 'media-playback-stop',    // TODO: replace with a proper icon
                    onClicked: () => Main.overview.toggle(),
                });
            case "apps":
                return new Widgets.Button({
                    name: 'gnometouch-navbar__apps-button',
                    styleClass: 'gnometouch-navbar__button',
                    iconName: 'view-grid-symbolic',
                    onClicked: () => Main.overview.dash.showAppsButton.checked = !Main.overview.dash.showAppsButton.checked,
                });
            case "back":
                return new Widgets.Button({
                    name: 'gnometouch-navbar__back-button',
                    styleClass: 'gnometouch-navbar__button',
                    iconName: 'media-playback-start-symbolic',  // TODO: replace with a proper icon
                    scaleX: -1,  // flip the icon (ugly)
                    pivotPoint: new Graphene.Point({x: 0.5, y: 0.5}),
                    onClicked: () => this._goBack(),
                });
            case "spacer":
                return new Widgets.Bin({
                    width: 15,
                });
            default:
                log(`Unknown button for ButtonNavigationBar: ${buttonType}`);
                return new St.Bin({});  // fallback to not crash on invalid settings
        }
    }

    private _goBack() {
        // Close OSK:
        if (Main.keyboard.visible) {
            Main.keyboard._keyboard
                ? Main.keyboard._keyboard.close(true)  // close with immediate = true
                : Main.keyboard.close()

        // Close apps overview:
        } else if (Main.overview.dash.showAppsButton.checked) {
            Main.overview.dash.showAppsButton.checked = false;

        // Close overview:
        } else if (Main.overview.visible) {
            Main.overview.hide();

        // Invoke Clutter.KEY_Back:
        } else {
            // Ideas: invoke "Alt + Left" keystroke (see: https://askubuntu.com/a/422448)
            //  or potentially "Esc", depending on context/active window/window type

            // TODO:
            //  - extract as a reusable function for other components
            //  - unfullscreen window if there's a fullscreen window focused
            //  - consider closing modal dialogs, if present  (maybe invoke escape key?)
            //  - consider closing current window on double or long tap

            this._virtualKeyboardDevice.notify_keyval(Clutter.get_current_event_time() * 1000,
                Clutter.KEY_Back, Clutter.KeyState.PRESSED);
            this._virtualKeyboardDevice.notify_keyval(Clutter.get_current_event_time() * 1000,
                Clutter.KEY_Back, Clutter.KeyState.RELEASED);
        }
    }

    destroy() {
        this._virtualKeyboardDevice.run_dispose();
        super.destroy();
    }
}
