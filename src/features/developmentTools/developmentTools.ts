import {DevelopmentRestartButton} from "$src/features/developmentTools/developmentRestartButton";
import {PatchManager} from "$src/utils/patchManager";
import * as Main from "@girs/gnome-shell/ui/main";
import {DevelopmentLogDisplay} from "$src/features/developmentTools/developmentLogDisplay";

export class DevelopmentTools {
    static readonly PATCH_SCOPE = Symbol('development-tools');

    constructor() {
        this.enable();
    }

    enable() {
        PatchManager.patch(() => {
            const restartButton = new DevelopmentRestartButton();
            //@ts-ignore
            Main.panel._rightBox.insert_child_at_index(restartButton, 0);

            const logDisplay = new DevelopmentLogDisplay();

            return () => {
                restartButton.destroy();
                logDisplay?.destroy();
            };
        }, {scope: DevelopmentTools.PATCH_SCOPE});
    }

    disable() {
        PatchManager.disable(DevelopmentTools.PATCH_SCOPE);
    }
}
