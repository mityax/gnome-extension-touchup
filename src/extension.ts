import '@girs/gnome-shell/extensions/global';

import * as Main from '@girs/gnome-shell/ui/main';
import {PatchManager} from "$src/utils/patchManager";
import NavigationBarFeature from "$src/features/navigationBar/navigationBarFeature";
import OskKeyPopupsFeature from "$src/features/osk/oskKeyPopupsFeature";
import {VirtualTouchpad} from "$src/features/virtual_touchpad/virtual_touchpad";
import Clutter from "@girs/clutter-15";
import {VirtualTouchpadQuickSettingsItem} from "$src/features/virtual_touchpad/virtual_touchpad_quicksettings_item";
import {NotificationGestures} from "$src/features/notifications/notificationGestures";
import {DevelopmentTools} from "$src/features/developmentTools/developmentTools";
import {debugLog} from "$src/utils/logging";
import {Extension} from "@girs/gnome-shell/extensions/extension";
import {initSettings} from "$src/features/preferences/backend";
import {kDebugMode} from "$src/config";


export default class GnomeTouchExtension extends Extension {
    navigationBar?: NavigationBarFeature;
    oskKeyPopups?: OskKeyPopupsFeature;
    virtualTouchpad?: VirtualTouchpad;
    virtualTouchpadOpenButton?: VirtualTouchpadQuickSettingsItem;
    notificationGestures?: NotificationGestures;
    developmentTools?: DevelopmentTools;

    static instance?: GnomeTouchExtension;

    enable() {
        debugLog("*************************************************")
        debugLog(`          Starting Gnome Touch v. ${this.metadata.version}          `)
        debugLog("*************************************************")
        debugLog()

        GnomeTouchExtension.instance = this;

        // @ts-ignore
        initSettings(this.getSettings());

        this.navigationBar = new NavigationBarFeature();
        this.oskKeyPopups = new OskKeyPopupsFeature();
        this.notificationGestures = new NotificationGestures();
        this.virtualTouchpad = new VirtualTouchpad();

        // Add virtual touchpad open button to panel:
        this.virtualTouchpadOpenButton = new VirtualTouchpadQuickSettingsItem(() => this.virtualTouchpad?.toggle());
        Main.panel.statusArea.quickSettings._system._systemItem.child.insert_child_at_index(
            this.virtualTouchpadOpenButton,
            2,  // add after battery indicator and spacer
        );

        if (kDebugMode) {
            this.developmentTools = new DevelopmentTools(this);
        }

        // React to touch-mode changes:
        PatchManager.patch(() => {
            const seat = Clutter.get_default_backend().get_default_seat();
            const id = seat.connect('notify::touch-mode', () => {
                this.syncUI();
            });
            return () => seat.disconnect(id);
        })

        this.syncUI();
    }

    syncUI() {
        const touchMode = Clutter.get_default_backend().get_default_seat().touchMode || (kDebugMode && this.developmentTools?.enforceTouchMode == true);

        if (touchMode) {
            this.navigationBar?.show();
        } else {
            this.navigationBar?.hide();
        }

        if (touchMode) {
            this.virtualTouchpadOpenButton?.show();
        } else {
            this.virtualTouchpadOpenButton?.hide();
        }
    }

    disable() {
        PatchManager.clear();
        this.navigationBar?.destroy();
        this.oskKeyPopups?.destroy();
        this.notificationGestures?.destroy();
        this.virtualTouchpad?.destroy();
        this.virtualTouchpadOpenButton?.destroy();
        this.developmentTools?.disable();

        this.navigationBar = undefined;
        this.oskKeyPopups = undefined;
        this.notificationGestures = undefined;
        this.virtualTouchpad = undefined;
        this.virtualTouchpadOpenButton = undefined;
        this.developmentTools = undefined;

        GnomeTouchExtension.instance = undefined;
    }
}
