import '@girs/gnome-shell/extensions/global';

import * as Main from '@girs/gnome-shell/ui/main';

import St from "@girs/st-13";
import Clutter from "@girs/clutter-13";
import NavigationBar from "$src/features/navigationBar/navigationBar";
import Shell from "@girs/shell-13";
import {EdgeDragAction} from "$src/utils/edgeDragAction";
import {PatchManager} from "$src/utils/patchManager";
import {findActorByName} from "$src/utils/utils";
import GLib from "@girs/glib-2.0";


export default class GnomeTouchExtension {
    private metadata: Record<string, any>;
    private scale_factor: number;
    private bar?: NavigationBar;

    constructor(metadata: Record<string, any>) {
        this.metadata = metadata;
        this.scale_factor = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scale_factor * 5;
    }

    enable() {
        // TODO: find touch-enabled monitors, keyword: ClutterInputDevice
        const monitor = Main.layoutManager.primaryMonitor!;
        this.bar = new NavigationBar(monitor, 'gestures');

        PatchManager.patch(() => {
            Main.layoutManager.addChrome(this.bar!, {
                affectsStruts: true,
                trackFullscreen: true,
            });
            //Main.uiGroup.set_child_above_sibling(this.bar, Main.layoutManager.panelBox);
            return () => Main.layoutManager.removeChrome(this.bar!);
        })

        PatchManager.patch(() => {
            Main.uiGroup.style_class += " gnometouch-setting-navbar-gestures";  // or 'gnometouch-setting-navbar-buttons'
            return () => Main.uiGroup.style_class = Main.uiGroup.style_class.replaceAll(/ gnometouch-\S+/g, '');
        })

        PatchManager.patch(() => {
            const dashToDockContainer = findActorByName(global.stage, 'dashtodockContainer');
            print("DashToDock container:", dashToDockContainer);
            const originalMarginBottom = dashToDockContainer?.marginBottom || 0;
            if (dashToDockContainer) {
                GLib.timeout_add_seconds(
                    GLib.PRIORITY_DEFAULT,
                    5,
                    () => {
                        print("Setting margin... ", originalMarginBottom + 38)
                        // FIXME: None of these work:
                        //dashToDockContainer.marginBottom = originalMarginBottom + 38;
                        //dashToDockContainer.y -= 38;
                        //dashToDockContainer.set_translation(0, -38, 0);
                        return false;
                    }
                )
            }
            return () => {
                if (dashToDockContainer) {
                    dashToDockContainer!.marginBottom = originalMarginBottom;
                }
            };
        })
    }

    disable() {
        PatchManager.clear();
    }
}
