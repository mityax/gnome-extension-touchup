import St from "@girs/st-13";
import {css} from "../../jsx/css";
import {Monitor} from "@girs/gnome-shell/ui/layout";
import {Patch, PatchManager} from "$src/utils/patchManager";
import * as Main from "@girs/gnome-shell/ui/main";
import {log} from "$src/utils/utils";
import Clutter from "@girs/clutter-13";


export class VirtualTouchpad {
    public static readonly PATCH_SCOPE = 'virtual-touchpad';
    private readonly actor: St.Widget;
    private openPatch: Patch;

    constructor(monitor: Monitor) {
        this.actor = new St.Bin({
            name: 'gnometouch-virtual-touchpad',
            style: css({
                backgroundColor: 'red',
            })
        });
        this.actor.width = monitor.width;
        this.actor.height = monitor.height;
        this.actor.x = 0;
        this.actor.y = 0;
        this.actor.hide();

        PatchManager.patch(() => {
            Main.uiGroup.set_child_above_sibling(this.actor, Main.layoutManager.screenShieldGroup);
            Main.layoutManager.addChrome(this.actor, {
                affectsStruts: false,
                trackFullscreen: false,
            });

            return () => Main.layoutManager.removeChrome(this.actor);
        }, {scope: VirtualTouchpad.PATCH_SCOPE});
    }

    open() {
        this.actor.show();
    }

    close() {
        this.actor.hide();
    }

    destroy() {
        this.actor?.destroy();
    }
}
