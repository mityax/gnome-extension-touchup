import * as Main from '@girs/gnome-shell/ui/main';

import {findActorByName, log} from "$src/utils/utils";
import {PatchManager} from "$src/utils/patchManager";
import Meta from "@girs/meta-14";
import Clutter from "@girs/clutter-14";

export class DashToDockIntegration {
    static readonly PATCH_SCOPE = 'integration-dashtodock';

    enable() {
        return; // TODO: fix

        // Fetch instance of DashToDock class: https://github.com/micheleg/dash-to-dock/blob/28e64a9b144ea52c5d941f603c6c4b591b976417/docking.js#L200
        const actor = findActorByName(global.stage, 'dashtodockContainer');

        if (actor && actor.constructor.name === 'DashToDock') {
            PatchManager.patchMethod(actor.constructor.prototype, '_animateIn', (originalMethod, time, delay) => {
                if (!Main.overview._animationInProgress /*  || actor._dockState !== 0 */) {  // 0 = State.HIDDEN
                    originalMethod(time, delay);
                } else {
                    const originalTranslation = actor.translationY;
                    actor.translationY += actor.height;
                    originalMethod(time, delay);

                    const f = () => {
                        actor!.ease({
                            translationY: originalTranslation,
                            duration: time * 1000,
                            delay: delay * 1000,
                            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                        });
                        Main.overview.disconnect(id);
                    }
                    const id = Main.overview.connect('shown', f, 'hidden', f);
                }
            });
            /*PatchManager.patch(() => {
                const id = Main.overview.connect('shown', () => {
                    log("Calling original method");
                    originalMethod();
                });
                return () => Main.overview.disconnect(id);
            }, { scope: DashToDockIntegration.PATCH_SCOPE })*/
        }
    }
}
