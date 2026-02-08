import Gio from "gi://Gio";

import {PatchManager} from "$src/core/patchManager";
import {DevelopmentTools} from "$src/features/developmentTools/developmentTools";
import {Extension} from "resource:///org/gnome/shell/extensions/extension.js";
import {initSettings, uninitSettings} from "$src/features/preferences/backend";
import {Delay} from "$src/utils/delay";
import {assetsGResourceFile, devMode} from "$src/config";
import {settings} from "$src/settings";
import ExtensionFeature from "$src/core/extensionFeature";
import {TouchModeService} from "$src/services/touchModeService";
import {DonationsFeature} from "$src/features/donations/donationsFeature";
import {NotificationService} from "$src/services/notificationService";
import {initLogger, logger, uninitLogger} from "$src/core/logging";
import {DisablePanelDragService} from "$src/services/disablePanelDragService";
import {ExtensionFeatureManager, FeatureMeta} from "$src/core/extensionFeatureManager";


export default class TouchUpExtension extends Extension {
    static instance?: TouchUpExtension;

    private pm?: PatchManager;
    private featureManager?: ExtensionFeatureManager;

    async enable() {
        TouchUpExtension.instance = this;

        initLogger();

        logger.debug("*************************************************")
        logger.debug(`          Starting TouchUp v. ${this.metadata.version}          `)
        logger.debug("*************************************************")
        logger.debug()

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
        }, 'init-settings');

        this.featureManager = new ExtensionFeatureManager(this.pm.fork("fm"));

        // This is the entry point for all services (= small supplementary ExtensionFeature's, that other
        // features need to work):
        await this.defineServices();

        // This is the entry point for all features of this extension:
        await this.defineFeatures();
    }

    private async defineServices() {
        await this.defineFeature({
            name: 'touch-mode-service',
            create: pm => new TouchModeService(pm)
        });
        await this.defineFeature({
            name: 'notification-service',
            create: async pm => new NotificationService(pm)
        });
        await this.defineFeature({
            name: 'disable-panel-drag-service',
            create: async pm => new DisablePanelDragService(pm),
        });
    }

    private async defineFeatures() {
        DEBUG:
            if (devMode) {
                await this.defineFeature({
                    name: 'development-tools',
                    create: (pm) => new DevelopmentTools(pm),
                });
            }

        // Optional features (that can be toggled on or off via a setting) are imported dynamically, for two reasons:
        //  - make the extension as slim as possible (users only "pay" for what they use)
        //  - make the extension more compatible with modified shells (e.g. Ubuntu or Gnome Mobile): turned off
        //    features cannot cause errors

        await this.defineFeature({
            name: 'navigation-bar',
            create: async pm => {
                const m = (await import('$src/features/navigationBar/navigationBarFeature'));
                return new m.NavigationBarFeature(pm);
            },
            setting: settings.navigationBar.enabled,
        });

        await this.defineFeature({
            name: 'background-gestures',
            create: async pm => {
                const m = (await import('$src/features/backgroundNavigationGestures/backgroundNavigationGesturesFeature'));
                return new m.BackgroundNavigationGesturesFeature(pm);
            },
        })

        await this.defineFeature({
            name: 'notification-gestures',
            create: async pm => {
                const m = (await import('$src/features/notifications/notificationGesturesFeature'));
                return new m.NotificationGesturesFeature(pm);
            },
            setting: settings.notificationGestures.enabled,
        });

        await this.defineFeature({
            name: 'osk',
            create: async pm => {
                const m = (await import('$src/features/osk/oskFeature'));
                return new m.OskFeature(pm);
            },
        });

        BETA:
            await this.defineFeature({
                name: 'panel-menus-swipe-to-open',
                create: async pm => {
                    const m = (await import('$src/features/panel/panelMenusSwipeToOpenFeature'));
                    return new m.PanelMenusSwipeToOpenFeature(pm);
                },
                // TODO: add setting
            });

        await this.defineFeature({
            name: 'floating-screen-rotate-button',
            create: async pm => {
                const m = (await import('$src/features/screenRotateUtils/floatingScreenRotateButtonFeature'));
                return new m.FloatingScreenRotateButtonFeature(pm);
            },
            setting: settings.screenRotateUtils.floatingScreenRotateButtonEnabled,
        });

        await this.defineFeature({
            name: 'double-tap-to-sleep',
            create: async pm => {
                const m = (await import('$src/features/doubleTapToSleep/doubleTapToSleepFeature'));
                return new m.DoubleTapToSleepFeature(pm);
            },
            setting: settings.doubleTapToSleep.enabled
        });

        BETA:
            await this.defineFeature({
                name: 'virtual-touchpad',
                create: async pm => {
                    const m = (await import('$src/features/virtualTouchpad/virtualTouchpadFeature'));
                    return new m.VirtualTouchpadFeature(pm);
                },
                setting: settings.virtualTouchpad.enabled,
            });

        await this.defineFeature({
            name: 'donations',
            create: pm => new DonationsFeature(pm),
        });
    }

    private async defineFeature<T extends ExtensionFeature>(meta: FeatureMeta<T>) {
        await this.featureManager!.defineFeature(meta);
    }

    disable() {
        // Cancel any pending delays:
        logger.debug(`Cancelling ${Delay.getAllPendingDelays().length} pending delay(s)`);
        Delay.getAllPendingDelays().forEach(d => d.cancel());

        // Destroy the root PatchManager and with that all its descendents:
        this.pm?.destroy();
        this.pm = undefined;

        // Destroy all features:
        this.featureManager?.destroy();
        this.featureManager = undefined;

        logger.debug("TouchUp extension successfully unloaded.");

        uninitLogger();

        TouchUpExtension.instance = undefined;
    }

    getFeature<T extends ExtensionFeature>(type: { new(...args: any[]): T }): T | null {
        return this.featureManager!.getFeature(type);
    }
}
