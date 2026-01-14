import {PatchManager} from "$src/utils/patchManager";
import {BoolSetting} from "$src/features/preferences/backend";


/**
 * Base class for each feature of this extension.
 */
export default abstract class ExtensionFeature {
    protected readonly pm: PatchManager;
    private readonly _subFeatures: ExtensionFeature[] = [];

    protected constructor(patchManager: PatchManager) {
        this.pm = patchManager;
    }

    /**
     * Adds a sub-feature to this extension feature and optionally binds (= automatically creates and destroys) it
     * to the given setting.
     *
     * If no setting is given, the sub-feature is created immediately and destroyed when this extension feature
     * is destroyed.
     *
     * @param featureName The sub-feature's name in kebab-case (used for debugging purposes mainly)
     * @param creator A function to create an instance of the sub-feature, using the given [PatchManager]
     * @param setting An optional setting to bind the sub-feature to.
     */
    protected addSubFeature<T extends ExtensionFeature>(featureName: string, creator: (pm: PatchManager) => T, setting?: BoolSetting) {
        let p = this.pm!.registerPatch(() => {
            // Create the feature:
            let feature: T | undefined = creator(this.pm!.fork(featureName));
            this._subFeatures.push(feature);

            return () => {
                // Destroy the feature on unpatch:
                feature?.destroy();

                // And remove it from the list:
                const idx = this._subFeatures.findIndex(f => f === feature);
                if (idx !== -1) this._subFeatures.splice(idx, 1);
            }
        }, `enable-feature(${featureName})`);

        if (setting) {
            // Enable the feature initially if setting is set to true:
            if (setting.get()) p.enable();

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
    }

    getSubFeature<T extends ExtensionFeature>(type: { new (...args: any[]): T }): T | null {
        return this._subFeatures.find(f => f instanceof type) as T ?? null;
    }

    destroy() {
        this.pm.destroy();

        // Destroy all sub-features (this has been done already by the PatchManager, but is explicitly done
        // here again to not make things unnecessarily complicated for reviewers):
        this._subFeatures.forEach(f => f.destroy());
        this._subFeatures.splice(0);  // clear the array
    }
}
