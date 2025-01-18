//@ts-ignore
import {InjectionManager} from "resource:///org/gnome/shell/extensions/extension.js";
import {PatchManager} from "$src/utils/patchManager.ts";


type AnyFunc = (...args: any[]) => any;
type Connectable = {connect: (s: string, h: AnyFunc) => any, disconnect: (id: number) => any};

/**
 * Base class for each feature of this extension.
 */
export default abstract class ExtensionFeature {
    protected constructor(protected pm: PatchManager) {}

    destroy() {
        this.pm.destroy();
    }
}
