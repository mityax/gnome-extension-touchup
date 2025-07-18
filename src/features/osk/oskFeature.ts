import ExtensionFeature from "$src/utils/extensionFeature";
import {PatchManager} from "$src/utils/patchManager";
import {settings} from "$src/settings";

import OSKKeyPopupFeature from "./_oskKeyPopupsFeature";
import OSKGesturesFeature from "./_oskGesturesFeature";


export default class OskFeature extends ExtensionFeature {
    constructor(pm: PatchManager) {
        super(pm);

        this.addSubFeature(
            'osk-key-popups',
            (pm) => new OSKKeyPopupFeature(pm),
            settings.osk.keyPopups.enabled,
        );

        this.addSubFeature(
            'osk-gestures',
            (pm) => new OSKGesturesFeature(pm),
            settings.osk.gestures.swipeToClose.enabled,
        );
    }

}
