import '@girs/gnome-shell/extensions/global';

import * as Main from '@girs/gnome-shell/ui/main';
import NavigationBar from "$src/features/navigationBar/navigationBar";
import {PatchManager} from "$src/utils/patchManager";
import {OSKKeyPopups} from "$src/features/osk/oskKeyPopups";
import {VirtualTouchpad} from "$src/features/virtual_touchpad/virtual_touchpad";
import * as PanelMenu from '@girs/gnome-shell/ui/panelMenu';
import St from "@girs/st-13";
import GLib from "@girs/glib-2.0";
import {log} from '$src/utils/utils';


export default class GnomeTouchExtension {
    private metadata: Record<string, any>;
    private bar?: NavigationBar;
    private oskKeyPopups?: OSKKeyPopups;
    private virtualTouchpad?: VirtualTouchpad;
    private virtualTouchpadOpenButton?: St.Button;

    constructor(metadata: Record<string, any>) {
        this.metadata = metadata;
    }

    enable() {
        // TODO: find touch-enabled monitors, keyword: ClutterInputDevice
        const monitor = Main.layoutManager.primaryMonitor!;
        this.bar = new NavigationBar(monitor, 'gestures');
        this.oskKeyPopups = new OSKKeyPopups();
        this.virtualTouchpad = new VirtualTouchpad(monitor);

        this.virtualTouchpadOpenButton = new St.Button({
            styleClass: 'panel-button',
            child: new St.Icon({
                iconName: 'input-touchpad-symbolic',  // 'computer-apple-ipad-symbolic'
                styleClass: 'system-status-icon',
                reactive: true,
            }),
        });
        this.virtualTouchpadOpenButton.connect('clicked', () => this.virtualTouchpad!.toggle())

        // Add virtual touchpad open button to panel:
        PatchManager.patch(() => {
            //@ts-ignore
            Main.panel._leftBox.insert_child_at_index(this.virtualTouchpadOpenButton, 1);
            //@ts-ignore
            return () => Main.panel._leftBox.remove_child(this.virtualTouchpadOpenButton);
        }, {scope: VirtualTouchpad.PATCH_SCOPE, debugName: 'add-virtual-touchpad-open-button'})

        // Add navigation bar:
        PatchManager.patch(() => {
            Main.layoutManager.addChrome(this.bar!, {
                affectsStruts: true,
                trackFullscreen: true,
            });
            //Main.uiGroup.set_child_above_sibling(this.bar, Main.layoutManager.panelBox);
            return () => Main.layoutManager.removeChrome(this.bar!);
        })

        PatchManager.patch(() => {
            Main.uiGroup.style_class += " gnometouch-setting-navbar-gestures";  // or 'gnometouch-setting-navbar-buttons'
            return () => Main.uiGroup.style_class = Main.uiGroup.style_class.replaceAll(/ gnometouch-\S+/g, '');
        })

        // To find dash to dock container:
        /*PatchManager.patch(() => {
            const dashToDockContainer = findActorByName(global.stage, 'dashtodockContainer');

            const originalMarginBottom = dashToDockContainer?.marginBottom || 0;
            if (dashToDockContainer) {

            }
            return () => {
                if (dashToDockContainer) {
                    dashToDockContainer!.marginBottom = originalMarginBottom;
                }
            };
        });*/

        // To get/listen to touch mode:
        // this._seat = Clutter.get_default_backend().get_default_seat();
        // this._seat.connect('notify::touch-mode', this._syncEnabled.bind(this));

        // Monitors-changed:
        // Main.layoutManager.connectObject('monitors-changed',
        //             this._relayout.bind(this), this);
    }

    disable() {
        PatchManager.clear();
        this.bar?.destroy();
        this.oskKeyPopups?.destroy();
        this.virtualTouchpad?.destroy();
        this.virtualTouchpadOpenButton?.destroy();
    }
}
