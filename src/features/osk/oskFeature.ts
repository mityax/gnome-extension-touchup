//@ts-ignore
import * as Keyboard from 'resource:///org/gnome/shell/ui/keyboard.js';
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import ExtensionFeature from "$src/core/extensionFeature";
import {settings} from "$src/settings";
import {OSKKeyPopupFeature} from "$src/features/osk/_oskKeyPopupsFeature";
import {OSKGesturesFeature} from "$src/features/osk/_oskGesturesFeature";
import {OSKQuickPasteAction} from "$src/features/osk/_oskQuickPasteActionFeature";
import {OskSpaceBarIMESwitchingFeature} from "$src/features/osk/_oskSpaceBarIMESwitchingFeature";


export class OskFeature extends ExtensionFeature {
    async initialize() {
        await this.defineSubFeature({
            name: 'osk-key-popups',
            create: (pm) => new OSKKeyPopupFeature(pm, Main.keyboard._keyboard),
            setting: settings.osk.keyPopups.enabled,
        });

        await this.defineSubFeature({
            name: 'osk-gestures',
            create: (pm) => new OSKGesturesFeature(pm, Main.keyboard._keyboard),
        });

       await this.defineSubFeature({
            name: 'osk-quick-paste-action',
            create: (pm) => new OSKQuickPasteAction(pm, Main.keyboard._keyboard),
            setting: settings.osk.quickPasteAction.enabled,
        });

        await this.defineSubFeature({
            name: 'osk-space-bar-ime-switching',
            create: (pm) => new OskSpaceBarIMESwitchingFeature(pm, Main.keyboard._keyboard),
            setting: settings.osk.spaceBarIMESwitching.enabled,
        })

        // When the keyboard is replaced/a new keyboard is created, notify all sub-features:
        const self = this;
        this.pm.appendToMethod(Keyboard.Keyboard.prototype, '_init', function(this: Keyboard.Keyboard) {
            self.getSubFeature(OSKKeyPopupFeature)?.onNewKeyboard(this);
            self.getSubFeature(OSKGesturesFeature)?.onNewKeyboard(this);
            self.getSubFeature(OSKQuickPasteAction)?.onNewKeyboard(this);
            self.getSubFeature(OskSpaceBarIMESwitchingFeature)?.onNewKeyboard(this);
        });
    }

}
