import Gio from "gi://Gio";

import {PatchManager} from "$src/utils/patchManager";
import {DevelopmentTools} from "$src/features/developmentTools/developmentTools";
import {Extension} from "resource:///org/gnome/shell/extensions/extension.js";
import {BoolSetting, initSettings, uninitSettings} from "$src/features/preferences/backend";
import {Delay} from "$src/utils/delay";
import {assetsGResourceFile, devMode} from "$src/config";
import {settings} from "$src/settings";
import ExtensionFeature from "$src/utils/extensionFeature";
import {TouchModeService} from "$src/services/touchModeService";
import {DonationsFeature} from "$src/features/donations/donationsFeature";
import {NotificationService} from "$src/services/notificationService";
import {initLogger, logger, uninitLogger} from "$src/utils/logging";


export default class TouchUpExtension extends Extension {
  static instance?: TouchUpExtension;

  pm?: PatchManager;
  features: ExtensionFeature[] = [];

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
    }, 'init-settings')

    // This is the entry point for all services (= small supplementary ExtensionFeature's, that other
    // features need to work):
    await this.defineServices();

    // This is the entry point for all features of this extension:
    await this.defineFeatures();
  }

  private async defineServices() {
    await this.defineFeature(
      'touch-mode-service',
      async pm => new TouchModeService(pm)
    );
    await this.defineFeature(
      'notification-service',
      async pm => new NotificationService(pm)
    );
  }

  private async defineFeatures() {
    DEBUG: if (devMode) {
      await this.defineFeature(
        'development-tools',
        async (pm) => new DevelopmentTools(pm),
      );
    }

    // Optional features (that can be toggled on or off via a setting) are imported dynamically, for two reasons:
    //  - make the extension as slim as possible (users only "pay" for what they use)
    //  - make the extension more compatible with modified shells (e.g. Ubuntu or Gnome Mobile): turned off
    //    features cannot cause errors

    await this.defineFeature(
      'navigation-bar',
      async pm => {
        const m = (await import('$src/features/navigationBar/navigationBarFeature'));
        return new m.NavigationBarFeature(pm);
      },
      settings.navigationBar.enabled,
    );

    await this.defineFeature(
      'background-gestures',
      async pm => {
        const m = (await import('$src/features/backgroundNavigationGestures/backgroundNavigationGesturesFeature'));
        return new m.BackgroundNavigationGesturesFeature(pm);
      },
    )

    await this.defineFeature(
      'notification-gestures',
      async pm => {
        const m = (await import('$src/features/notifications/notificationGesturesFeature'));
        return new m.NotificationGesturesFeature(pm);
      },
      settings.notificationGestures.enabled,
    );

    await this.defineFeature(
      'osk',
      async pm => {
        const m = (await import('$src/features/osk/oskFeature'));
        return new m.OskFeature(pm);
      },
    );

    BETA: await this.defineFeature(
        'panel-menus-swipe-to-open',
        async pm => {
          const m = (await import('$src/features/panel/panelMenusSwipeToOpen'));
          return new m.PanelMenusSwipeToOpenFeature(pm);
        },
        // TODO: add setting
    );

    await this.defineFeature(
      'floating-screen-rotate-button',
      async pm => {
        const m = (await import('$src/features/screenRotateUtils/floatingScreenRotateButtonFeature'));
        return new m.FloatingScreenRotateButtonFeature(pm);
      },
      settings.screenRotateUtils.floatingScreenRotateButtonEnabled,
    );

    BETA: await this.defineFeature(
      'virtual-touchpad',
      async pm => {
        const m = (await import('$src/features/virtualTouchpad/virtualTouchpadFeature'));
        return new m.VirtualTouchpadFeature(pm);
      },
      settings.virtualTouchpad.enabled,
    );

    await this.defineFeature(
      'donations',
      async pm => new DonationsFeature(pm),
    );
  }

  /**
   * A utility method to define [ExtensionFeature]s that are optionally automatically enabled/disabled
   * depending on the given [setting].
   *
   * All features are created in a patch and are therefore automatically disabled when the extension is
   * disabled.
   *
   * For example usages see [defineFeatures] above.
   */
  private async defineFeature<T extends ExtensionFeature>(
    featureName: string,
    create: (pm: PatchManager) => Promise<T>,
    setting?: BoolSetting,
  ) {
    let resolve: (..._: any) => void;
    let promise = new Promise((r) => resolve = r);

    let p = this.pm!.registerPatch(() => {
      // Create the feature:
      let feature: T | undefined;

      create(this.pm!.fork(featureName))
        .then(f => {
          feature = f;
          this.features.push(f);
        })
        .catch(e => {
          logger.error(`Error while activating feature "${featureName}":`, e);
          PROD: setting?.set(false);  // Disable the feature for future launches
          import('$src/utils/showFeatureInitializationErrorNotification')
            .then(m => m.showFeatureInitializationFailedNotification(featureName, e));
        })
        .then(_ => resolve());

      return () => {
        // Destroy the feature on unpatch:
        this.features = this.features.filter(f => f !== feature);
        feature?.destroy();
      }
    }, `enable-feature(${featureName})`);

    if (setting) {
      // Enable the feature initially if setting is set to true:
      if (setting.get()) {
        p.enable();
      } else {
        // @ts-ignore
        resolve();  // if the setting is not enabled, just resolve without enabling the feature
      }

      // Connect to setting changes:
      this.pm!.connectTo(setting, 'changed', value => {
        if (value) {
          p.enable();
        } else {
          p.disable();
        }
      });
    } else {
      p.enable();
    }

    return promise;
  }

  disable() {
    // Cancel any pending delays:
    logger.debug(`Cancelling ${Delay.getAllPendingDelays().length} pending delay(s)`);
    Delay.getAllPendingDelays().forEach(d => d.cancel());

    // Destroy the root PatchManager and with that all its descendents:
    this.pm?.destroy();
    this.pm = undefined;

    // Destroy all features (this has been done already by the PatchManager, but is explicitly done here
    // again to not make things unnecessarily complicated for reviewers):
    this.features.forEach(f => f.destroy());
    this.features = [];

    logger.debug("TouchUp extension successfully unloaded.");

    uninitLogger();

    TouchUpExtension.instance = undefined;
  }

  getFeature<T extends ExtensionFeature>(type: { new(...args: any[]): T }): T | null {
    return this.features.find(f => f instanceof type) as T ?? null;
  }
}
