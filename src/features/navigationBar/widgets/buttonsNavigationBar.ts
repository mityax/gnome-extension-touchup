import BaseNavigationBar from "./baseNavigationBar";
import St from "@girs/st-15";
import {Widgets} from "$src/utils/ui/widgets";
import * as Main from '@girs/gnome-shell/ui/main';
import Graphene from "@girs/graphene-1.0";
import Clutter from "@girs/clutter-15";
import Meta from "@girs/meta-15";
import ActorAlign = Clutter.ActorAlign;
import MotionDirection = Meta.MotionDirection;


export default class ButtonsNavigationBar extends BaseNavigationBar<St.BoxLayout> {
    private _virtualKeyboardDevice: Clutter.VirtualInputDevice;

    constructor() {
        super({
            reserveSpace: true,
            actor: new Widgets.Row({
                name: 'gnometouch-navbar',
                styleClass: 'gnometouch-navbar bottom-panel',
                children: [
                    // Left side:
                    new Widgets.Row({
                        xExpand: false,
                        children: [
                            new Widgets.Button({
                                name: 'gnometouch-navbar__osk-button',
                                styleClass: 'gnometouch-navbar__button',
                                iconName: 'input-keyboard-symbolic',
                                connect: {
                                    'clicked': () => {} // Main.keyboard.open(), // TODO: implement
                                }
                            }),
                        ]
                    }),
                    // Center:
                    new Widgets.Row({
                        xExpand: true,
                        xAlign: ActorAlign.CENTER,
                        children: [

                        ]
                    }),
                    // Right side:
                    new Widgets.Row({
                        xExpand: false,
                        children: [
                            new Widgets.Button({
                                name: 'gnometouch-navbar__workspace-previous-button',
                                styleClass: 'gnometouch-navbar__button',
                                iconName: 'go-previous-symbolic',
                                connect: {
                                    'clicked': () => this.moveToWorkspace('left'),
                                }
                            }),
                            new Widgets.Button({
                                name: 'gnometouch-navbar__overview-button',
                                styleClass: 'gnometouch-navbar__button',
                                iconName: 'view-grid-symbolic',
                                connect: {
                                    'clicked': () => Main.overview.toggle(),
                                }
                            }),
                            new Widgets.Button({
                                name: 'gnometouch-navbar__workspace-next-button',
                                styleClass: 'gnometouch-navbar__button',
                                iconName: 'go-next-symbolic',
                                connect: {
                                    'clicked': () => this.moveToWorkspace('right'),
                                }
                            }),
                            new Widgets.Bin({
                                width: 15,
                            }),
                            new Widgets.Button({
                                name: 'gnometouch-navbar__back-button',
                                styleClass: 'gnometouch-navbar__button',
                                iconName: 'media-playback-start-symbolic',  // TODO: replace with a proper icon
                                scaleX: -1,  // flip the icon (ugly)
                                pivotPoint: new Graphene.Point({x: 0.5, y: 0.5}),
                                connect: {
                                    'clicked': () => this._goBack(),
                                }
                            }),
                        ]
                    }),
                ]
            }),
        });

        let seat = Clutter.get_default_backend().get_default_seat();
        this._virtualKeyboardDevice = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
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

    private _goBack() {
        if (Main.overview.visible) {
            Main.overview.hide();
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
