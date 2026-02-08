//@ts-ignore
import * as Keyboard from 'resource:///org/gnome/shell/ui/keyboard.js';
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import ExtensionFeature from "$src/core/extensionFeature";
import {PatchManager} from "$src/core/patchManager";
import {settings} from "$src/settings";
import {OSKKeyPopupFeature} from "$src/features/osk/_oskKeyPopupsFeature";
import {OSKGesturesFeature} from "$src/features/osk/_oskGesturesFeature";


export class OskFeature extends ExtensionFeature {
    constructor(pm: PatchManager) {
        super(pm);

        this.defineSubFeature({
            name: 'osk-key-popups',
            create: (pm) => new OSKKeyPopupFeature(pm, Main.keyboard._keyboard),
            setting: settings.osk.keyPopups.enabled,
        });

        this.defineSubFeature({
            name: 'osk-gestures',
            create: (pm) => new OSKGesturesFeature(pm, Main.keyboard._keyboard),
        });

        // When the keyboard is replaced/a new keyboard is created, notify all sub-features:
        const self = this;
        this.pm.appendToMethod(Keyboard.Keyboard.prototype, '_init', function(this: Keyboard.Keyboard) {
            self.getSubFeature(OSKKeyPopupFeature)?.onNewKeyboard(this);
            self.getSubFeature(OSKGesturesFeature)?.onNewKeyboard(this);
        });
    }

}
