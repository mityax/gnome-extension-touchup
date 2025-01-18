//@ts-ignore
import {InjectionManager} from "resource:///org/gnome/shell/extensions/extension.js";
import {PatchManager} from "$src/utils/patchManager.ts";


type AnyFunc = (...args: any[]) => any;
type Connectable = {connect: (s: string, h: AnyFunc) => any, disconnect: (id: number) => any};

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
