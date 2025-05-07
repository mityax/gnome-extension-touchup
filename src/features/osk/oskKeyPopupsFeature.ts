import * as Main from 'resource:///org/gnome/shell/ui/main.js';
//@ts-ignore
import * as Keyboard from 'resource:///org/gnome/shell/ui/keyboard.js';

import {findActorBy, UnknownClass} from "$src/utils/utils";
import * as BoxPointer from "resource:///org/gnome/shell/ui/boxpointer.js";
import St from "gi://St";
import {log} from "$src/utils/logging";
import ExtensionFeature from "$src/utils/extensionFeature";
import {settings} from "$src/settings";
import {Delay} from "$src/utils/delay";
import {PatchManager} from "$src/utils/patchManager";
import Clutter from "gi://Clutter";


export default class OskKeyPopupsFeature extends ExtensionFeature {
    private keyPrototype: any;
    private boxPointers: Map<Clutter.Actor, BoxPointer.BoxPointer> = new Map();

    constructor(pm: PatchManager) {
        super(pm);

        const self = this;

        this.pm.appendToMethod(Keyboard.Keyboard.prototype, 'open', function (this: UnknownClass, ..._) {
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
        this.pm.appendToMethod(keyProto, '_press', function (this: Clutter.Actor, button, commitString) {
            if (!self.boxPointers.get(this) && commitString && commitString.trim().length > 0) {
                self.pm.patch(() => {
                    const bp = self._buildBoxPointer(this, commitString);
                    Main.layoutManager.addTopChrome(bp);
                    self.boxPointers.set(this, bp);
                    // @ts-ignore
                    bp.connect('destroy', () => self.boxPointers.delete(this));

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
            Delay.ms(settings.oskKeyPopups.duration.get()).then(() => {
                // @ts-ignore
                self.boxPointers.get(this)?.close(BoxPointer.PopupAnimation.FULL);
            })
        });

        // Hide the key popup when the key's subkeys (umlauts etc.) popup is shown:
        this.pm.appendToMethod(keyProto, '_showSubkeys', function (this: Clutter.Actor) {
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
