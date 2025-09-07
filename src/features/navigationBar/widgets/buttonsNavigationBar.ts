import BaseNavigationBar from "./baseNavigationBar";
import St from "gi://St";
import * as Widgets from "$src/utils/ui/widgets";
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Clutter from "gi://Clutter";
import {settings} from "$src/settings";
import {logger} from "$src/utils/logging";
import {moveToWorkspace, navigateBack} from "$src/features/navigationBar/navigationBarUtils";
import {AssetIcon} from "$src/utils/ui/assetIcon";
import {SettingsType} from "$src/features/preferences/backend";
import GLib from "gi://GLib";
import ActorAlign = Clutter.ActorAlign;


export default class ButtonsNavigationBar extends BaseNavigationBar<St.BoxLayout> {
    private readonly _virtualKeyboardDevice: Clutter.VirtualInputDevice;

    constructor() {
        super({ reserveSpace: true });

        let seat = Clutter.get_default_backend().get_default_seat();
        this._virtualKeyboardDevice = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    }

    protected _buildActor(): St.BoxLayout {
        return new Widgets.Row({
            name: 'touchup-navbar',
            styleClass: 'touchup-navbar',
            onRealize: () => GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                // Since the navigation bar's button sizes are not yet available before/at realization (at least
                // in Gnome >= 49), we schedule reallocation here once:
                this.reallocate();
                return GLib.SOURCE_REMOVE;
            }),
            children: [
                // Left side:
                new Widgets.Row({
                    xExpand: false,
                    children: settings.navigationBar.buttonsLeft.get().map(b => this._buildButton(b as any)),
                    onCreated: (row) => {
                        const id = settings.navigationBar.buttonsLeft.connect("changed", newValue => {
                            row.destroy_all_children();
                            for (let b of settings.navigationBar.buttonsLeft.get()) {
                                row.add_child(this._buildButton(b as any));
                            }
                        });
                        return () => settings.navigationBar.buttonsLeft.disconnect(id);
                    }
                }),
                // Center:
                new Widgets.Row({
                    xExpand: true,
                    xAlign: ActorAlign.CENTER,
                    children: settings.navigationBar.buttonsMiddle.get().map(b => this._buildButton(b as any)),
                    onCreated: (row) => {
                        const id = settings.navigationBar.buttonsMiddle.connect("changed", newValue => {
                            row.destroy_all_children();
                            for (let b of settings.navigationBar.buttonsMiddle.get()) {
                                row.add_child(this._buildButton(b as any));
                            }
                        });
                        return () => settings.navigationBar.buttonsMiddle.disconnect(id);
                    },
                }),
                // Right side:
                new Widgets.Row({
                    xExpand: false,
                    children: settings.navigationBar.buttonsRight.get().map(b => this._buildButton(b as any)),
                    onCreated: (row) => {
                        const id = settings.navigationBar.buttonsRight.connect("changed", newValue => {
                            row.destroy_all_children();
                            for (let b of settings.navigationBar.buttonsRight.get()) {
                                row.add_child(this._buildButton(b as any));
                            }
                        });
                        return () => settings.navigationBar.buttonsRight.disconnect(id);
                    },
                }),
            ]
        });
    }

    protected onUpdateToSurrounding(surrounding: {isWindowNear: boolean, isInOverview: boolean}): void {
        if (surrounding.isWindowNear && !surrounding.isInOverview) {
            // Make navbar opaque (black or white, based on shell theme brightness):
            this.actor.remove_style_class_name('touchup-navbar--transparent');
        } else {
            // Make navbar transparent:
            this.actor.add_style_class_name('touchup-navbar--transparent');
        }
    }

    private _buildButton(buttonType: SettingsType<typeof settings.navigationBar.buttonsLeft>[0]): St.Widget {
        switch (buttonType) {
            case "keyboard":
                return new Widgets.Button({
                    name: 'touchup-navbar__osk-button',
                    styleClass: 'touchup-navbar__button',
                    iconName: 'input-keyboard-symbolic',
                    onClicked: () => Main.keyboard.open(this.monitor.index),
                });
            case "workspace-previous":
                return new Widgets.Button({
                    name: 'touchup-navbar__workspace-previous-button',
                    styleClass: 'touchup-navbar__button',
                    iconName: 'go-previous-symbolic',
                    onClicked: () => moveToWorkspace('left'),
                });
            case "workspace-next":
                return new Widgets.Button({
                    name: 'touchup-navbar__workspace-next-button',
                    styleClass: 'touchup-navbar__button',
                    iconName: 'go-next-symbolic',
                    onClicked: () => moveToWorkspace('right'),
                });
            case "overview":
                return new Widgets.Button({
                    name: 'touchup-navbar__overview-button',
                    styleClass: 'touchup-navbar__button',
                    child: new Widgets.Icon({
                        gicon: new AssetIcon('box-outline-symbolic'),
                    }),
                    onClicked: () => Main.overview.toggle(),
                });
            case "apps":
                return new Widgets.Button({
                    name: 'touchup-navbar__apps-button',
                    styleClass: 'touchup-navbar__button',
                    child: new Widgets.Icon({
                        gicon: new AssetIcon('grid-large-symbolic'),
                    }),
                    onClicked: () => {
                        Main.overview.show();
                        Main.overview.dash.showAppsButton.checked = !Main.overview.dash.showAppsButton.checked;
                    },
                });
            case "back":
                return new Widgets.Button({
                    name: 'touchup-navbar__back-button',
                    styleClass: 'touchup-navbar__button',
                    child: new Widgets.Icon({
                        gicon: new AssetIcon('arrow2-left-symbolic'),
                    }),
                    onClicked: () => navigateBack({virtualKeyboardDevice: this._virtualKeyboardDevice}),
                    onLongPress: () => navigateBack({
                        virtualKeyboardDevice: this._virtualKeyboardDevice,
                        greedyMode: true,
                    }),
                });
            case "spacer":
                return new Widgets.Bin({ width: 20 });
            default:
                DEBUG: {
                    // If typescript complains here, that means a button is missing above:
                    assertExhaustive(buttonType);
                }

                logger.warn(`Unknown button for ButtonNavigationBar: ${buttonType}`);

                return new St.Bin({});  // fallback to not crash on invalid settings
        }
    }
}


/**
 * Helper to make typescript statically check whether a switch is exhaustive or not.
 */
function assertExhaustive(p: never) {}
