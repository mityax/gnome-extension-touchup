import * as Main from 'resource:///org/gnome/shell/ui/main.js';
//@ts-ignore
import * as Keyboard from 'resource:///org/gnome/shell/ui/keyboard.js';

import {findActorBy, UnknownClass} from "$src/utils/utils";
import * as BoxPointer from "resource:///org/gnome/shell/ui/boxpointer.js";
import St from "gi://St";
import {log} from "$src/utils/logging";
import ExtensionFeature from "$src/utils/extensionFeature";
import {settings} from "$src/settings.ts";
import {Delay} from "$src/utils/delay.ts";


export default class OskKeyPopupsFeature extends ExtensionFeature {
    private keyPrototype: any;

    constructor() {
        super();

        const self = this;

        this.appendToMethod(Keyboard.Keyboard.prototype, 'open', function (this: UnknownClass, ..._) {
            // Only do this once (this patch is only responsible for retrieving the `Key` prototype,
            // which is key (pun intended) to create the OSK popups):
            if (!self.keyPrototype) {
                self.keyPrototype = self._extractKeyPrototype(this);

                if (!self.keyPrototype) {
                    log("Could not extract Key prototype, thus not patching OSK key popups.");
                } else {
                    self._patchKeyMethods(self.keyPrototype);
                }
            }
        });
    }

    private _patchKeyMethods(keyProto: any) {
        const self = this;

        // Show the key popup on key press:
        this.appendToMethod(keyProto, '_press', function (this: UnknownClass, button, commitString) {
            if (!this._gnometouch_boxPointer && commitString && commitString.trim().length > 0) {
                this._gnometouch_boxPointer = self._buildBoxPointer(this, commitString);
            }
            this._gnometouch_boxPointer?.open(BoxPointer.PopupAnimation.FULL);

            Delay.ms(2000).then(() => {
                this._gnometouch_boxPointer?.close(BoxPointer.PopupAnimation.FULL);
            });
        });

        // Hide the key popup a few ms after a key has been released:
        this.appendToMethod(keyProto, '_release', function (this: UnknownClass, button, commitString) {
            Delay.ms(settings.oskKeyPopups.duration.get()).then(() => {
                this._gnometouch_boxPointer?.close(BoxPointer.PopupAnimation.FULL);
            })
        });

        // Hide the key popup when the key's subkeys (umlauts etc.) popup is shown:
        this.appendToMethod(keyProto, '_showSubkeys', function (this: UnknownClass) {
            this._gnometouch_boxPointer?.close();
        });

        // Destroy the key popup/boxpointer when the key is destroyed:
        this.appendToMethod(keyProto, '_onDestroy', function (this: UnknownClass) {
            this._gnometouch_boxPointer?.destroy();
            this._gnometouch_boxPointer = null;
        });
    }

    private _buildBoxPointer(key: any, commitString: string) {
        const bp = new BoxPointer.BoxPointer(St.Side.BOTTOM, {
            styleClass: 'key-container',
        });
        bp.add_style_class_name('keyboard-subkeys');
        Main.layoutManager.addTopChrome(bp);
        bp.setPosition(key.keyButton, 0.5);

        if (key._icon && key.iconName) {
            bp.bin.set_child(new St.Icon({
                styleClass: 'keyboard-key',
                name: key.iconName,
                width: key.keyButton.allocation.get_width(),
                height: key.keyButton.allocation.get_height(),
            }));
        } else {
            bp.bin.set_child(new St.Button({
                styleClass: 'keyboard-key',
                label: key.keyButton.get_label() || commitString,
                width: key.keyButton.allocation.get_width(),
                height: key.keyButton.allocation.get_height(),
            }));
        }
        return bp;
    }

    private _extractKeyPrototype(keyboard: Keyboard.Keyboard) {
        let r = findActorBy(
            keyboard._aspectContainer,
            a => a.constructor.name === 'Key' && !!Object.getPrototypeOf(a),
        );

        return r !== null
            ? Object.getPrototypeOf(r)
            : null;
    }
}
