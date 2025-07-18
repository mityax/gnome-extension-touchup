import {PatchManager} from "$src/utils/patchManager";
import NavigationBarFeature from "$src/features/navigationBar/navigationBarFeature";
import OskFeature from "$src/features/osk/oskFeature";
import {VirtualTouchpadFeature} from "$src/features/virtualTouchpad/virtualTouchpadFeature";
import {NotificationGesturesFeature} from "$src/features/notifications/notificationGesturesFeature";
import {DevelopmentTools} from "$src/features/developmentTools/developmentTools";
import {debugLog} from "$src/utils/logging";
import {Extension} from "resource:///org/gnome/shell/extensions/extension.js";
import {BoolSetting, initSettings, uninitSettings} from "$src/features/preferences/backend";
import {FloatingScreenRotateButtonFeature} from "$src/features/screenRotateUtils/floatingScreenRotateButtonFeature";
import {Delay} from "$src/utils/delay";
import {assetsGResourceFile, devMode} from "$src/config";
import ExtensionFeature from "$src/utils/extensionFeature";
import {settings} from "$src/settings";
import Gio from "gi://Gio";
import DonationsFeature from "$src/features/donations/donationsFeature";
import {TouchModeService} from "$src/services/touchModeService";
import {OverviewGesturesFeature} from "$src/features/overviewGestures/overviewGesturesFeature";

export default class TouchUpExtension extends Extension {
    static instance?: TouchUpExtension;

    pm?: PatchManager;
    features: ExtensionFeature[] = [];

    enable() {
        debugLog("*************************************************")
        debugLog(`          StartingTouchUp v. ${this.metadata.version}          `)
        debugLog("*************************************************")
        debugLog()

        TouchUpExtension.instance = this;

        // This is the root patch manager of which all other patch managers are descendents:
        this.pm = new PatchManager("root");

        // Load assets:
        this.pm.patch(() => {
            const assets = Gio.resource_load(this.dir.get_child(assetsGResourceFile).get_path()!);
            Gio.resources_register(assets);
            return () => Gio.resources_unregister(assets);
        }, 'load-and-register-assets');

        // Initialize settings:
        this.pm.patch(() => {
            initSettings(this.getSettings());
            return () => uninitSettings();
        }, 'init-settings')

        // This is the entry point for all services (= small supplementary ExtensionFeature's, that other
        // features need to work):
        this.defineServices();

        // This is the entry point for all features of this extension:
        this.defineFeatures();

        // Sync ui on touch-mode and monitor changes:
        this.getFeature(TouchModeService)?.onChanged.connect(() => this.syncUI());
        this.pm.connectTo(global.backend.get_monitor_manager(), 'monitors-changed', () => this.syncUI());

        this.syncUI();
    }

    syncUI() {
        let touchMode = this.getFeature(TouchModeService)!.isTouchModeActive;

        // TODO: uncomment:
        BETA: this.getFeature(VirtualTouchpadFeature)?.setCanOpen(touchMode /*&&  global.display.get_n_monitors() > 1*/);
    }


    private defineServices() {
        this.defineFeature(
            'touch-mode-service',
            pm => new TouchModeService(pm)
        );
    }

    private defineFeatures() {
        DEBUG: if (devMode) {
            this.defineFeature(
                'development-tools',
                (pm) => new DevelopmentTools(pm),
            );
        }

        this.defineFeature(
            'navigation-bar',
            pm => new NavigationBarFeature(pm),
            settings.navigationBar.enabled,
        );

        BETA: this.defineFeature(
            'overview-gestures',
            pm => new OverviewGesturesFeature(pm),
            settings.overviewGestures.enabled,
        )

        this.defineFeature(
            'notification-gestures',
            pm => new NotificationGesturesFeature(pm),
            settings.notificationGestures.enabled,
        );

        this.defineFeature(
            'osk',
            pm => new OskFeature(pm),
        );

        this.defineFeature(
            'floating-screen-rotate-button',
            pm => new FloatingScreenRotateButtonFeature(pm),
            settings.screenRotateUtils.floatingScreenRotateButtonEnabled,
        );

        BETA: this.defineFeature(
            'virtual-touchpad',
            pm => new VirtualTouchpadFeature(pm),
            settings.virtualTouchpad.enabled,
        );

        this.defineFeature(
            'donations',
            pm => new DonationsFeature(pm),
        )
    }

    /**
     * A utility method to define [ExtensionFeature]s that are optionally automatically enabled/disabled
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
        setting?: BoolSetting,
    ) {
        let p = this.pm!.registerPatch(() => {
            // Create the feature:
            let feature: T | undefined = create(this.pm!.fork(featureName));
            this.features.push(feature);

            return () => {
                // Destroy the feature on unpatch:
                this.features = this.features.filter(f => f != feature);
                feature?.destroy();
            }
        }, `enable-feature(${featureName})`);

        if (setting) {
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
        } else {
            p.enable();
        }
    }

    disable() {
        // Cancel any pending delays:
        debugLog(`Cancelling ${Delay.getAllPendingDelays().length} pending delay(s)`);
        Delay.getAllPendingDelays().forEach(d => d.cancel());

        // Destroy the root PatchManager and with that all its descendents:
        this.pm?.destroy();
        this.pm = undefined;

        // Destroy all features (this has been done already by the PatchManager, but is explicitly done here
        // again to not make things unnecessarily complicated for reviewers):
        this.features.forEach(f => f.destroy());
        this.features = [];

        TouchUpExtension.instance = undefined;

        debugLog("TouchUp extension successfully unloaded.");
    }

    getFeature<T extends ExtensionFeature>(type: { new (...args: any[]): T }): T | null {
        return this.features.find(f => f instanceof type) as T ?? null;
    }
}
