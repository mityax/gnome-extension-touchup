//@ts-ignore
import * as Keyboard from 'resource:///org/gnome/shell/ui/keyboard.js';
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import ExtensionFeature from "$src/utils/extensionFeature";
import {PatchManager} from "$src/utils/patchManager";
import {settings} from "$src/settings";

import OSKKeyPopupFeature from "./_oskKeyPopupsFeature";
import OSKGesturesFeature from "./_oskGesturesFeature";


export class OskFeature extends ExtensionFeature {
    constructor(pm: PatchManager) {
        super(pm);

        this.addSubFeature(
            'osk-key-popups',
            (pm) => new OSKKeyPopupFeature(pm, Main.keyboard._keyboard),
            settings.osk.keyPopups.enabled,
        );

        this.addSubFeature(
            'osk-gestures',
            (pm) => new OSKGesturesFeature(pm, Main.keyboard._keyboard),
        );

        // When the keyboard is replaced/a new keyboard is created, notify all sub-features:
        const self = this;
        this.pm.appendToMethod(Keyboard.Keyboard.prototype, '_init', function(this: Keyboard.Keyboard) {
            self.getSubFeature(OSKKeyPopupFeature)?.onNewKeyboard(this);
            self.getSubFeature(OSKGesturesFeature)?.onNewKeyboard(this);
        });
    }

}
