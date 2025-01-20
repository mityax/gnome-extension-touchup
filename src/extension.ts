import {PatchManager} from "$src/utils/patchManager";
import NavigationBarFeature from "$src/features/navigationBar/navigationBarFeature";
import OskKeyPopupsFeature from "$src/features/osk/oskKeyPopupsFeature";
import {VirtualTouchpadFeature} from "$src/features/virtualTouchpad/virtualTouchpadFeature";
import Clutter from "gi://Clutter";
import {NotificationGesturesFeature} from "$src/features/notifications/notificationGesturesFeature.ts";
import {DevelopmentTools} from "$src/features/developmentTools/developmentTools";
import {debugLog} from "$src/utils/logging";
import {Extension} from "resource:///org/gnome/shell/extensions/extension.js";
import {BoolSetting, initSettings, uninitSettings} from "$src/features/preferences/backend";
import {FloatingScreenRotateButtonFeature} from "$src/features/screenRotateUtils/floatingScreenRotateButtonFeature.ts";
import {Delay} from "$src/utils/delay.ts";
import {assetsGResourceFile, devMode} from "$src/config.ts";
import ExtensionFeature from "$src/utils/extensionFeature.ts";
import {settings} from "$src/settings.ts";
import Gio from "gi://Gio";


export default class GnomeTouchExtension extends Extension {
    pm?: PatchManager;

    navigationBar?: NavigationBarFeature;
    oskKeyPopups?: OskKeyPopupsFeature;
    floatingScreenRotateButtonFeature?: FloatingScreenRotateButtonFeature;
    virtualTouchpad?: VirtualTouchpadFeature;
    notificationGestures?: NotificationGesturesFeature;
    developmentTools?: DevelopmentTools;

    enable() {
        debugLog("*************************************************")
        debugLog(`          Starting Gnome Touch v. ${this.metadata.version}          `)
        debugLog("*************************************************")
        debugLog()

        // This is the root patch manager of which all other patch managers are descendents:
        this.pm = new PatchManager("root");

        // Load assets:
        this.pm.patch(() => {
            const assets = Gio.resource_load(this.dir.get_child(assetsGResourceFile).get_path()!);
            Gio.resources_register(assets);
            return () => Gio.resources_unregister(assets);
        });

        // Initialize settings:
        this.pm.patch(() => {
            initSettings(this.getSettings());
            return () => uninitSettings();
        })

        DEBUG: if (devMode) this.pm!.patch(() => {
            this.developmentTools = new DevelopmentTools(this.pm!.fork('development-tools'), this);
            return () => {
                this.developmentTools?.destroy();
                this.developmentTools = undefined;
            }
        });

        // This is the entry point for all features of this extension:
        this.defineFeatures();

        // Sync ui on touch-mode and monitor changes:
        this.pm.connectTo(Clutter.get_default_backend().get_default_seat(), 'notify::touch-mode', () => this.syncUI());
        this.pm.connectTo(global.backend.get_monitor_manager(), 'monitors-changed', () => this.syncUI());

        this.syncUI();
    }

    syncUI() {
        let touchMode = Clutter.get_default_backend().get_default_seat().get_touch_mode();

        DEBUG: if (this.developmentTools?.enforceTouchMode) touchMode = true;

        if (touchMode) {
            this.navigationBar?.show();
        } else {
            this.navigationBar?.hide();
        }

        this.virtualTouchpad?.setCanOpen(touchMode /*&&  global.display.get_n_monitors() > 1*/);
    }


    private defineFeatures() {
        this.defineFeature(
            'navigation-bar',
            (pm) => new NavigationBarFeature(pm),
            (f) => this.navigationBar = f,
            settings.navigationBar.enabled,
        );

        this.defineFeature(
            'osk-key-popups',
            (pm) => new OskKeyPopupsFeature(pm),
            (f) => this.oskKeyPopups = f,
            settings.oskKeyPopups.enabled,
        );

        this.defineFeature(
            'floating-screen-rotate-button',
            (pm) => new FloatingScreenRotateButtonFeature(pm),
            (f) => this.floatingScreenRotateButtonFeature = f,
            settings.screenRotateUtils.floatingScreenRotateButtonEnabled,
        );

        this.defineFeature(
            'notification-gestures',
            (pm) => new NotificationGesturesFeature(pm),
            (f) => this.notificationGestures = f,
            settings.notificationGestures.enabled,
        );

        BETA: this.defineFeature(
            'virtual-touchpad',
            (pm) => new VirtualTouchpadFeature(pm),
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
        featureName: string,
        create: (pm: PatchManager) => T,
        assign: (feature?: T) => void,
        setting: BoolSetting,
    ) {
        let p = this.pm!.registerPatch(() => {
            // Create the feature and call `assign` to allow the callee to create references:
            let feature: T | undefined = create(this.pm!.fork(featureName));
            assign(feature);

            // Destroy the feature and call assign with `undefined` to remove all references:
            return () => {
                feature?.destroy();
                feature = undefined;
                assign(feature);
            }
        }, `enable-extension-feature(${featureName})`);

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
