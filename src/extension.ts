import '@girs/gnome-shell/extensions/global';

import * as Main from '@girs/gnome-shell/ui/main';
import NavigationBar from "$src/features/navigationBar/navigationBar";
import {PatchManager} from "$src/utils/patchManager";
import {OSKKeyPopups} from "$src/features/osk/oskKeyPopups";
import {VirtualTouchpad} from "$src/features/virtual_touchpad/virtual_touchpad";
import * as PanelMenu from '@girs/gnome-shell/ui/panelMenu';
import St from "@girs/st-14";
import GLib from "@girs/glib-2.0";
import {log} from '$src/utils/utils';
import Clutter from "@girs/clutter-14";
import {VirtualTouchpadQuickSettingsItem} from "$src/features/virtual_touchpad/virtual_touchpad_quicksettings_item";


export default class GnomeTouchExtension {
    private metadata: Record<string, any>;
    private bar?: NavigationBar;
    private oskKeyPopups?: OSKKeyPopups;
    private virtualTouchpad?: VirtualTouchpad;
    private virtualTouchpadOpenButton?: VirtualTouchpadQuickSettingsItem;

    constructor(metadata: Record<string, any>) {
        this.metadata = metadata;
    }

    enable() {
        this.bar = new NavigationBar('gestures');
        this.oskKeyPopups = new OSKKeyPopups();
        this.virtualTouchpad = new VirtualTouchpad();

        // Add virtual touchpad open button to panel:
        this.virtualTouchpadOpenButton = new VirtualTouchpadQuickSettingsItem(() => this.virtualTouchpad?.toggle());
        Main.panel.statusArea.quickSettings._system._systemItem.child.insert_child_at_index(
            this.virtualTouchpadOpenButton,
            2,  // add after battery indicator and spacer
        );

        // Add style classes for settings:
        PatchManager.patch(() => {
            Main.uiGroup.add_style_class_name("gnometouch-setting-navbar-gestures");  // or 'gnometouch-setting-navbar-buttons'
            return () => Main.uiGroup.style_class = Main.uiGroup.style_class.replaceAll(/ gnometouch-\S+/g, '');
        })

        // React to touch-mode changes:
        PatchManager.patch(() => {
            const seat = Clutter.get_default_backend().get_default_seat();
            const id = seat.connect('notify::touch-mode', () => {
                this._syncUI();
            });
            return () => seat.disconnect(id);
        })
        // ... and to monitor changes:
        PatchManager.patch(() => {
            const monitorManager = global.backend.get_monitor_manager();
            const id = monitorManager.connect_after('monitors-changed', () => this._syncUI());
            return () => monitorManager.disconnect(id);
        })

        this._syncUI();
    }

    private _syncUI() {
        const touchMode = Clutter.get_default_backend().get_default_seat().touchMode;

        if (touchMode) {
            Main.layoutManager.addChrome(this.bar!, {
                affectsStruts: true,
                trackFullscreen: true,
            });
            Main.uiGroup.add_style_class_name('gnometouch-navbar-visible');
        } else {
            Main.layoutManager.removeChrome(this.bar!);
            Main.uiGroup.remove_style_class_name('gnometouch-navbar-visible');
        }

        if (touchMode/* && Main.layoutManager.monitors.length > 1*/) {  // TODO: uncomment when development is done
            this.virtualTouchpadOpenButton?.show();
        } else {
            this.virtualTouchpadOpenButton?.hide();
        }
    }

    disable() {
        PatchManager.clear();
        this.bar?.destroy();
        this.oskKeyPopups?.destroy();
        this.virtualTouchpad?.destroy();
        this.virtualTouchpadOpenButton?.destroy();
    }
}
