import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {PatchManager} from "$src/utils/patchManager";
import NavigationBarFeature from "$src/features/navigationBar/navigationBarFeature";
import OskKeyPopupsFeature from "$src/features/osk/oskKeyPopupsFeature";
import {VirtualTouchpadFeature} from "$src/features/virtualTouchpad/virtualTouchpadFeature";
import Clutter from "gi://Clutter";
import {VirtualTouchpadQuickSettingsItem} from "$src/features/virtualTouchpad/virtualTouchpadQuickSettingsItem";
import {NotificationGesturesFeature} from "$src/features/notifications/notificationGesturesFeature.ts";
import {DevelopmentTools} from "$src/features/developmentTools/developmentTools";
import {debugLog} from "$src/utils/logging";
import {Extension} from "resource:///org/gnome/shell/extensions/extension.js";
import {BoolSetting, initSettings, uninitSettings} from "$src/features/preferences/backend";
import {FloatingScreenRotateButtonFeature} from "$src/features/screenRotateUtils/floatingScreenRotateButtonFeature.ts";
import {Delay} from "$src/utils/delay.ts";
import {devMode} from "$src/config.ts";
import ExtensionFeature from "$src/utils/extensionFeature.ts";
import {settings} from "$src/settings.ts";


export default class GnomeTouchExtension extends Extension {
    pm?: PatchManager;

    navigationBar?: NavigationBarFeature;
    oskKeyPopups?: OskKeyPopupsFeature;
    floatingScreenRotateButtonFeature?: FloatingScreenRotateButtonFeature;
    virtualTouchpad?: VirtualTouchpadFeature;
    virtualTouchpadOpenButton?: VirtualTouchpadQuickSettingsItem;
    notificationGestures?: NotificationGesturesFeature;
    developmentTools?: DevelopmentTools;

    enable() {
        debugLog("*************************************************")
        debugLog(`          Starting Gnome Touch v. ${this.metadata.version}          `)
        debugLog("*************************************************")
        debugLog()

        // This is the root patch manager of which all other patch managers are descendents:
        this.pm = new PatchManager("root");

        // Initialize settings:
        this.pm.patch(() => {
            initSettings(this.getSettings());
            return () => uninitSettings();
        })

        DEBUG: if (devMode) this.pm!.patch(() => {
            this.developmentTools = new DevelopmentTools(this.pm!.fork('development-tools-feature'), this);
            return () => {
                this.developmentTools?.destroy();
                this.developmentTools = undefined;
            }
        });

        // This is the entry point for all features of this extension:
        this.defineFeatures();

        // TODO: make this part of [VirtualTouchpadFeature]:
        // Add virtual touchpad open button to panel:
        this.pm.patch(() => {
            this.virtualTouchpadOpenButton = new VirtualTouchpadQuickSettingsItem(() => this.virtualTouchpad?.toggle());
            Main.panel.statusArea.quickSettings._system._systemItem.child.insert_child_at_index(
                this.virtualTouchpadOpenButton,
                2,  // add after battery indicator and spacer
            );
            return () => this.virtualTouchpadOpenButton?.destroy();
        });

        // React to touch-mode changes:
        this.pm.connectTo(Clutter.get_default_backend().get_default_seat(), 'notify::touch-mode', () => this.syncUI());

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


    private defineFeatures() {
        this.defineFeature(
            () => new NavigationBarFeature(this.pm!.fork('navigation-bar-feature')),
            (f) => this.navigationBar = f,
            settings.navigationBar.enabled,
        );

        this.defineFeature(
            () => new OskKeyPopupsFeature(this.pm!.fork('osk-key-popup-feature')),
            (f) => this.oskKeyPopups = f,
            settings.oskKeyPopups.enabled,
        );

        this.defineFeature(
            () => new FloatingScreenRotateButtonFeature(this.pm!.fork('floating-screen-rotate-button-feature')),
            (f) => this.floatingScreenRotateButtonFeature = f,
            settings.screenRotateUtils.floatingScreenRotateButtonEnabled,
        );

        this.defineFeature(
            () => new NotificationGesturesFeature(this.pm!.fork('notification-gestures-feature')),
            (f) => this.notificationGestures = f,
            settings.notificationGestures.enabled,
        );

        this.defineFeature(
            () => new VirtualTouchpadFeature(this.pm!.fork('virtual-touchpad-feature')),
            (f) => this.virtualTouchpad = f,
            settings.virtualTouchpad.enabled,
        );
    }

    /**
     * A utility method to define [ExtensionFeature]s that are automatically enabled/disabled
     * depending on the given [setting] and are mapped to a class attribute using [assign].
     *
     * Note that the [assign] callback can (and will upon feature or extension disabling) be
     * called with `undefined' as its value; this is intended behavior and the callback should
     * unset the reference it assigned before in this case.
     *
     * All features are created in a patch and are therefore automatically disabled and set to
     * `undefined` when the extension is disabled.
     *
     * For example usages see [defineFeatures] above.
     */
    private defineFeature<T extends ExtensionFeature>(
        create: () => T,
        assign: (feature?: T) => void,
        setting: BoolSetting,
    ) {
        let p = this.pm!.registerPatch(() => {
            // Create the feature and call `assign` to allow the callee to create references:
            let feature: T | undefined = create();
            assign(feature);

            // Destroy the feature and call assign with `undefined` to remove all references:
            return () => {
                feature?.destroy();
                feature = undefined;
                assign(feature);
            }
        }, `enable-extension-feature(setting: ${setting.key})`);

        // Enable the feature initially if setting is set to true:
        if (setting.get()) p.enable();

        // Connect to setting changes:
        this.pm!.connectTo(setting, 'changed', value => {
            if (value) {
                p.enable();
                this.syncUI();
            } else {
                p.disable();
            }
        });
    }

    disable() {
        debugLog(`Cancelling ${Delay.getAllPendingDelays().length} pending delay(s)`);
        Delay.getAllPendingDelays().forEach(d => d.cancel());

        this.pm?.destroy();
        this.pm = undefined;
    }
}
