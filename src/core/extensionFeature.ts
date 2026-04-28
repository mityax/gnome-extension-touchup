import {PatchManager} from "$src/core/patchManager";
import {ExtensionFeatureManager, FeatureMeta} from "$src/core/extensionFeatureManager";
import EventEmitter from "$src/utils/eventEmitter";


/**
 * Base class for each feature of this extension.
 */
export default abstract class ExtensionFeature<E extends Record<string, any[]> = {}> extends EventEmitter<AsRecord<{
    'sub-feature-enabled': [ExtensionFeature<any>],
    'sub-feature-disabled': [string],
} & E>> {
    protected readonly pm: PatchManager;
    private readonly subFeatureManager: ExtensionFeatureManager;

    constructor(patchManager: PatchManager) {
        super();

        this.pm = patchManager;
        this.subFeatureManager = new ExtensionFeatureManager(this.pm.fork("fm"));

        // Notice: Using the [PatchManager] is not required here (subFeatureManager is destroyed), this is just to
        // make Shexli happy
        this.pm.connectTo(this.subFeatureManager, 'feature-enabled', (f) => this.emit('sub-feature-enabled', f));
        this.pm.connectTo(this.subFeatureManager, 'feature-disabled', (name) => this.emit('sub-feature-disabled', name));
    }

    /**
     * Subclasses can overwrite this to perform initialization requiring async code. This will be called
     * by the [FeatureManager] immediately after the constructor has been invoked, and will be awaited
     * by the enclosing context before continuing.
     */
    async initialize(): Promise<void> {}

    /**
     * Adds a sub-feature to this extension feature and optionally binds (= automatically creates and destroys) it
     * to the given setting.
     *
     * If no setting is given, the sub-feature is created immediately and destroyed when this extension feature
     * is destroyed.
     */
    protected async defineSubFeature<T extends ExtensionFeature>(meta: FeatureMeta<T>): Promise<void> {
        await this.subFeatureManager.defineFeature(meta);
    }

    getSubFeature<T extends ExtensionFeature>(type: { new (...args: any[]): T }): T | null {
        return this.subFeatureManager.getFeature(type);
    }

    /**
     * Called when the Shells session mode has changed, without the extension being disabled
     * and re-enabled.
     *
     * Important: When overriding this method, make sure to call the super classes method to
     * ensure that all subfeatures are properly notified too.
     */
    async notifySessionModeChanged() {
        await this.subFeatureManager.notifySessionModeChanged();
    }

    destroy() {
        this.pm.destroy();

        // Destroy all sub-features (this has been done already by the PatchManager, but is explicitly done
        // here again to not make things unnecessarily complicated for reviewers):
        this.subFeatureManager.destroy();
    }
}


type AsRecord<T> =
    T extends Record<any, any> ? { [A in keyof T]: T[A] } : never;


