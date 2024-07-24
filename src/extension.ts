import '@girs/gnome-shell/extensions/global';

import * as Main from '@girs/gnome-shell/ui/main';
import NavigationBar from "$src/features/navigationBar/navigationBar";
import {PatchManager} from "$src/utils/patchManager";
import {OSKKeyPopups} from "$src/features/osk/oskKeyPopups";
import {VirtualTouchpad} from "$src/features/virtual_touchpad/virtual_touchpad";
import GLib from "@girs/glib-2.0";
import Clutter from "@girs/clutter-14";
import {VirtualTouchpadQuickSettingsItem} from "$src/features/virtual_touchpad/virtual_touchpad_quicksettings_item";
import {DashToDockIntegration} from "$src/features/integrations/dashToDock";
import {NotificationGestures} from "$src/features/notifications/notificationGestures";
import {DevelopmentTools} from "$src/features/developmentTools/developmentTools";
import {debugLog} from "$src/utils/logging";


export default class GnomeTouchExtension {
    private metadata: Record<string, any>;
    private bar?: NavigationBar;
    private oskKeyPopups?: OSKKeyPopups;
    private virtualTouchpad?: VirtualTouchpad;
    private virtualTouchpadOpenButton?: VirtualTouchpadQuickSettingsItem;
    private notificationGestures?: NotificationGestures;
    private developmentTools?: DevelopmentTools;

    constructor(metadata: Record<string, any>) {
        this.metadata = metadata;
    }

    enable() {
        debugLog("*************************************************")
        debugLog(`          Starting Gnome Touch v. ${this.metadata.version}          `)
        debugLog("*************************************************")
        debugLog()

        this.bar = new NavigationBar('gestures');
        this.oskKeyPopups = new OSKKeyPopups();
        this.notificationGestures = new NotificationGestures();
        this.virtualTouchpad = new VirtualTouchpad();

        // Add virtual touchpad open button to panel:
        this.virtualTouchpadOpenButton = new VirtualTouchpadQuickSettingsItem(() => this.virtualTouchpad?.toggle());
        Main.panel.statusArea.quickSettings._system._systemItem.child.insert_child_at_index(
            this.virtualTouchpadOpenButton,
            2,  // add after battery indicator and spacer
        );

        if (GnomeTouchExtension.isDebugMode) {
            this.developmentTools = new DevelopmentTools(this);
        }

        // Add style classes for settings:
        PatchManager.patch(() => {
            Main.uiGroup.add_style_class_name("gnometouch-setting-navbar-gestures");  // or 'gnometouch-setting-navbar-buttons'
            return () => Main.uiGroup.style_class = Main.uiGroup.style_class.replaceAll(/ gnometouch-\S+/g, '');
        })

        // React to touch-mode changes:
        PatchManager.patch(() => {
            const seat = Clutter.get_default_backend().get_default_seat();
            const id = seat.connect('notify::touch-mode', () => {
                this.syncUI();
            });
            return () => seat.disconnect(id);
        })
        // ... and to monitor changes:
        PatchManager.patch(() => {
            const monitorManager = global.backend.get_monitor_manager();
            const id = monitorManager.connect_after('monitors-changed', () => this.syncUI());
            return () => monitorManager.disconnect(id);
        })

        this.syncUI();

        this.enableIntegrations();
    }

    syncUI() {
        const touchMode = Clutter.get_default_backend().get_default_seat().touchMode || (GnomeTouchExtension.isDebugMode && this.developmentTools?.enforceTouchMode == true);

        if (touchMode) {
            Main.layoutManager.addChrome(this.bar!, {
                affectsStruts: false,
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
        this.notificationGestures?.destroy();
        this.virtualTouchpad?.destroy();
        this.virtualTouchpadOpenButton?.destroy();
        this.developmentTools?.disable();
    }

    private enableIntegrations() {
        const d = new DashToDockIntegration();
        d.enable();
    }

    static get isDebugMode() {
        return /^(true|1|yes)$/.test(GLib.getenv('GNOMETOUCH_DEBUG_MODE') || 'false');
    }
}
