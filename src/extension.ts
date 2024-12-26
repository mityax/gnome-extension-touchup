import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {PatchManager} from "$src/utils/patchManager";
import NavigationBarFeature from "$src/features/navigationBar/navigationBarFeature";
import OskKeyPopupsFeature from "$src/features/osk/oskKeyPopupsFeature";
import {VirtualTouchpad} from "$src/features/virtualTouchpad/virtualTouchpadFeature";
import Clutter from "gi://Clutter";
import {VirtualTouchpadQuickSettingsItem} from "$src/features/virtualTouchpad/virtualTouchpadQuickSettingsItem";
import {NotificationGestures} from "$src/features/notifications/notificationGestures";
import {DevelopmentTools} from "$src/features/developmentTools/developmentTools";
import {debugLog} from "$src/utils/logging";
import {Extension} from "resource:///org/gnome/shell/extensions/extension.js";
import {initSettings} from "$src/features/preferences/backend";
import {ScreenRotateUtilsFeature} from "$src/features/screenRotateUtils/screenRotateUtilsFeature.ts";


export default class GnomeTouchExtension extends Extension {
    navigationBar?: NavigationBarFeature;
    oskKeyPopups?: OskKeyPopupsFeature;
    screenRotateUtils?: ScreenRotateUtilsFeature;
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

        DEBUG: this.developmentTools = new DevelopmentTools(this);

        this.navigationBar = new NavigationBarFeature();
        this.oskKeyPopups = new OskKeyPopupsFeature();
        this.screenRotateUtils = new ScreenRotateUtilsFeature();
        this.notificationGestures = new NotificationGestures();
        this.virtualTouchpad = new VirtualTouchpad();

        // Add virtual touchpad open button to panel:
        this.virtualTouchpadOpenButton = new VirtualTouchpadQuickSettingsItem(() => this.virtualTouchpad?.toggle());
        Main.panel.statusArea.quickSettings._system._systemItem.child.insert_child_at_index(
            this.virtualTouchpadOpenButton,
            2,  // add after battery indicator and spacer
        );

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
        let touchMode = Clutter.get_default_backend().get_default_seat().touchMode;

        DEBUG: if (this.developmentTools?.enforceTouchMode) touchMode = true;

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
        this.screenRotateUtils?.destroy();
        this.notificationGestures?.destroy();
        this.virtualTouchpad?.destroy();
        this.virtualTouchpadOpenButton?.destroy();
        this.developmentTools?.disable();

        this.navigationBar = undefined;
        this.oskKeyPopups = undefined;
        this.screenRotateUtils = undefined;
        this.notificationGestures = undefined;
        this.virtualTouchpad = undefined;
        this.virtualTouchpadOpenButton = undefined;
        this.developmentTools = undefined;

        GnomeTouchExtension.instance = undefined;
    }
}
