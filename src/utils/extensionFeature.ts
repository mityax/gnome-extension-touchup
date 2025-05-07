import {PatchManager} from "$src/utils/patchManager";


/**
 * Base class for each feature of this extension.
 */
export default abstract class ExtensionFeature {
    protected readonly pm: PatchManager;

    protected constructor(patchManager: PatchManager) {
        this.pm = patchManager;
    }

    destroy() {
        this.pm.destroy();
    }
}
