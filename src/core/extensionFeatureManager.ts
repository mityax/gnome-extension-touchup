import {PatchManager} from "./patchManager";
import ExtensionFeature from "./extensionFeature";
import {BoolSetting} from "../features/preferences/backend";
import {assert, logger} from "./logging";

export enum SessionMode { user, unlockDialog }

export type FeatureMeta<T extends ExtensionFeature> = {
    name: string;
    create: (pm: PatchManager) => (Promise<T> | T);
    setting?: BoolSetting;
    sessionModes?: SessionMode[];
};


export class ExtensionFeatureManager {
    private pm: PatchManager;
    private registry: Map<string, FeatureMeta<any>> = new Map();
    private features: Map<string, ExtensionFeature> = new Map();

    constructor(pm: PatchManager) {
        this.pm = pm;
    }

    /**
     * A utility method to define [ExtensionFeature]s that are optionally automatically enabled/disabled
     * depending on the given [setting].
     *
     * All features are automatically destroyed when this [FeatureManager] is destroyed.
     *
     * For example usages see [defineFeatures] above.
     */
    async defineFeature<T extends ExtensionFeature>(meta: FeatureMeta<T>) {
        assert(!this.registry.has(meta.name), `Cannot register already existing feature "${meta.name}"`);

        this.registry.set(meta.name, meta);

        await this._syncFeatureEnabled(meta);

        // Connect to setting changes:
        if (meta.setting) {
            this.pm!.connectTo(meta.setting, 'changed', () => this._syncFeatureEnabled(meta));
        }
    }

    /**
     * Get a feature by its type, if enabled.
     */
    getFeature<T extends ExtensionFeature>(type: { new(...args: any[]): T }): T | null {
        for (let feature of this.features.values()) {
            if (feature instanceof type)
                return feature;
        }

        return null;
    }

    private async _tryInitializeFeature<T extends ExtensionFeature>(meta: FeatureMeta<T>): Promise<T | null> {
        // Make sure no feature gets dropped without being properly destroyed:
        this._destroyFeature(meta);

        try {
            const feature = await meta.create(this.pm!.fork(meta.name));
            this.features.set(meta.name, feature);
            return feature;
        } catch (e) {
            logger.error(`Error while activating feature "${meta.name}":`, e);

            // Disable the feature for future launches:
            PROD: meta.setting?.set(false);

            // Show a notification:
            import('$src/utils/showFeatureInitializationErrorNotification')
                .then(m => m.showFeatureInitializationFailedNotification(meta.name, e));
        }

        return null;
    }

    private _destroyFeature<T extends ExtensionFeature>(meta: FeatureMeta<T>) {
        this.features.get(meta.name)?.destroy();
        this.features.delete(meta.name);
    }

    /**
     * Evaluate whether the given feature should be enabled or not, and initialize/destroy it accordingly.
     *
     * This function will not perform any action if the feature is already in the correct state.
     *
     * @return `true` if the feature has been initialized, `false` if it has been destroyed or failed to
     *          initialize, and `null` if no change has been made.
     */
    private async _syncFeatureEnabled<T extends ExtensionFeature>(meta: FeatureMeta<T>): Promise<boolean | null> {
        const isEnabled = this.features.has(meta.name);
        const shouldBeEnabled = meta.setting == null || meta.setting.get();

        if (shouldBeEnabled && !isEnabled) {
            // Create the feature:
            const feature = await this._tryInitializeFeature(meta);
            return feature != null;
        } else if (!shouldBeEnabled && isEnabled) {
            this._destroyFeature(meta);
            return false;
        }

        return null;
    }

    /** Destroy all features that are currently enabled */
    destroy(): void {
        for (const [name, feature] of [...this.features].reverse()) {
            feature.destroy();
        }
        this.features.clear();

        this.pm.destroy();
    }
}
