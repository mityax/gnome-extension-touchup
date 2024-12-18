import BaseNavigationBar from "./baseNavigationBar";
import St from "gi://St";
import {Widgets} from "$src/utils/ui/widgets";
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Graphene from "gi://Graphene";
import Clutter from "gi://Clutter";
import Meta from "gi://Meta";
import {settings} from "$src/settings.ts";
import {debugLog, log} from "$src/utils/logging.ts";
import {moveToWorkspace, navigateBack} from "$src/features/navigationBar/navigationBarUtils.ts";
import ActorAlign = Clutter.ActorAlign;


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
                    onClicked: () => moveToWorkspace('left'),
                });
            case "workspace-next":
                return new Widgets.Button({
                    name: 'gnometouch-navbar__workspace-next-button',
                    styleClass: 'gnometouch-navbar__button',
                    iconName: 'go-next-symbolic',
                    onClicked: () => moveToWorkspace('right'),
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
                    onClicked: () => {
                        debugLog("Clicked!");
                        navigateBack({
                            virtualKeyboardDevice: this._virtualKeyboardDevice,
                        });
                    },
                    onLongPress: () => {
                        debugLog("Long pressed!");
                        navigateBack({
                            virtualKeyboardDevice: this._virtualKeyboardDevice,
                            greedyMode: true,
                        });
                    },
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

    destroy() {
        this._virtualKeyboardDevice.run_dispose();
        super.destroy();
    }
}
