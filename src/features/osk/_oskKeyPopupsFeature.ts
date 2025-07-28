import * as Main from 'resource:///org/gnome/shell/ui/main.js';
//@ts-ignore
import * as Keyboard from 'resource:///org/gnome/shell/ui/keyboard.js';
import * as BoxPointer from "resource:///org/gnome/shell/ui/boxpointer.js";
import Clutter from "gi://Clutter";
import St from "gi://St";

import {log} from "$src/utils/logging";
import ExtensionFeature from "$src/utils/extensionFeature";
import {settings} from "$src/settings";
import {Delay} from "$src/utils/delay";
import {PatchManager} from "$src/utils/patchManager";
import {extractKeyPrototype} from "./_oskUtils";


export default class OSKKeyPopupFeature extends ExtensionFeature {
    private boxPointers: Map<Clutter.Actor, BoxPointer.BoxPointer> = new Map();
    private _hasPatchedKeyProto: boolean = false;

    constructor(pm: PatchManager, keyboard: Keyboard.Keyboard | null) {
        super(pm);

        if (keyboard !== null) {
            this.onNewKeyboard(keyboard);
        }
    }

    private _patchKeyMethods(keyProto: any) {
        const self = this;

        // Show the key popup on key press:
        this.pm.appendToMethod(keyProto, '_press', function (this: Clutter.Actor, button, commitString) {
            if (!self.boxPointers.get(this) && commitString && commitString.trim().length > 0) {
                const bpPatch = self.pm.patch(() => {
                    const bp = self._buildBoxPointer(this, commitString);
                    Main.layoutManager.addTopChrome(bp);
                    self.boxPointers.set(this, bp);
                    // @ts-ignore
                    bp.connect('destroy', () => {
                        self.boxPointers.delete(this);
                        self.pm.drop(bpPatch);
                    });

                    return () => bp.destroy();
                });
            }

            // @ts-ignore
            self.boxPointers.get(this)?.open(BoxPointer.PopupAnimation.FULL);

            Delay.ms(2000).then(() => {
                // @ts-ignore
                self.boxPointers.get(this)?.close(BoxPointer.PopupAnimation.FULL);
            });
        });

        // Hide the key popup a few ms after a key has been released:
        this.pm.appendToMethod(keyProto, '_release', function (this: Clutter.Actor, button, commitString) {
            Delay.ms(settings.osk.keyPopups.duration.get()).then(() => {
                // @ts-ignore
                self.boxPointers.get(this)?.close(BoxPointer.PopupAnimation.FULL);
            })
        });

        // Hide the key popup when the key's subkeys (umlauts etc.) popup is shown:
        this.pm.appendToMethod(keyProto, ['_showSubkeys', 'cancel'], function (this: Clutter.Actor) {
            // @ts-ignore
            self.boxPointers.get(this)?.close();
        });

        // Destroy the key popup/boxpointer when the key is destroyed:
        this.pm.appendToMethod(keyProto, '_onDestroy', function (this: Clutter.Actor) {
            // @ts-ignore
            self.boxPointers.get(this)?.destroy();
        });
    }

    private _buildBoxPointer(key: any, commitString: string) {
        const bp = new BoxPointer.BoxPointer(St.Side.BOTTOM, {
            styleClass: 'key-container',
        });
        bp.add_style_class_name('keyboard-subkeys');
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

    public onNewKeyboard(keyboard: Keyboard.Keyboard) {
        if (!this._hasPatchedKeyProto) {
            let proto = extractKeyPrototype(keyboard);

            if (proto !== null) {
                this._patchKeyMethods(proto);
                this._hasPatchedKeyProto = true;
            } else {
                log("Could not extract Key prototype, thus not patching OSK key popups.");
            }
        }
    }
}
