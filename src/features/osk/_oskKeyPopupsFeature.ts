import * as Main from 'resource:///org/gnome/shell/ui/main.js';
//@ts-ignore
import * as Keyboard from 'resource:///org/gnome/shell/ui/keyboard.js';
import Clutter from "gi://Clutter";
import GObject from "gi://GObject";

import {logger} from "$src/core/logging";
import ExtensionFeature from "$src/core/extensionFeature";
import {settings} from "$src/settings";
import {Delay} from "$src/utils/delay";
import {PatchManager} from "$src/core/patchManager";
import {extractKeyPrototype} from "./_oskUtils";
import * as Widgets from '$src/utils/ui/widgets';


export class OSKKeyPopupFeature extends ExtensionFeature {
    private _keyPopupsCache: Map<Clutter.Actor, KeyPopup> = new Map();
    private _hasPatchedKeyProto: boolean = false;

    constructor(pm: PatchManager, keyboard: Keyboard.Keyboard | null) {
        super(pm);

        // Destroy all cached popups on style change:
        this.pm.connectTo(settings.osk.keyPopups.style, 'changed', () => {
            this._keyPopupsCache.forEach((popup) => popup.destroy());
            this._keyPopupsCache.clear();
        });

        if (keyboard !== null) {
            this.onNewKeyboard(keyboard);
        }
    }

    private _patchKeyMethods(keyProto: any) {
        const self = this;

        // Show the key popup on key press:
        this.pm.appendToMethod(keyProto, '_press', function (this: Keyboard.Key & Clutter.Actor, button, commitString) {
            if (!commitString || commitString.trim().length === 0) {
                return;
            }

            if (!self._keyPopupsCache.get(this)) {
                self._createKeyPopup(this, commitString);
            }

            self._keyPopupsCache.get(this)?.open();

            Delay.ms(2000).then(() => {
                self._keyPopupsCache.get(this)?.close();
            });
        });

        // Hide the key popup a few ms after a key has been released:
        this.pm.appendToMethod(keyProto, '_release', function (this: Clutter.Actor, button, commitString) {
            Delay.ms(settings.osk.keyPopups.duration.get()).then(() => {
                self._keyPopupsCache.get(this)?.close();
            })
        });

        // Hide the key popup when the key's subkeys (umlauts etc.) popup is shown or the keypress is cancelled:
        this.pm.appendToMethod(keyProto, ['_showSubkeys', 'cancel'], function (this: Clutter.Actor) {
            // @ts-ignore
            self._keyPopupsCache.get(this)?.close();
        });
    }

    private _createKeyPopup(key: Keyboard.Key & Clutter.Actor, commitString: string) {
        const popup = new KeyPopup({
            sourceActor: key,
            label: commitString,
        });

        this._keyPopupsCache.set(key, popup);

        // When the popup is destroyed (which it is automatically, when the key it's attached to is),
        // remove it from the cache and drop this patch (to not destroy again later):
        popup.connect('destroy', () => this._keyPopupsCache.delete(key));

        // Destroy the popup on extension (or feature) disabling:
        this.pm.autoDestroy(popup);

        return popup;
    }

    public onNewKeyboard(keyboard: Keyboard.Keyboard) {
        if (!this._hasPatchedKeyProto) {
            let proto = extractKeyPrototype(keyboard);

            if (proto !== null) {
                this._patchKeyMethods(proto);
                this._hasPatchedKeyProto = true;
            } else {
                logger.error("Could not extract Key prototype, thus not patching OSK key popups.");
            }
        }
    }
}


class KeyPopup extends Widgets.Column {
    static {
        GObject.registerClass(this);
    }

    private readonly _sourceActor: Clutter.Actor;
    private readonly _label: Widgets.Label;
    private _open: boolean = false;

    constructor(props: {sourceActor: Clutter.Actor, label: string}) {
        super({
            styleClass: [
                'touchup-osk-key-popup',
                `touchup-osk-key-popup--${settings.osk.keyPopups.style.get()}`,
                'keyboard-key'
            ],  // inherit default key style via `keyboard-key` (color is overwritten in CSS)
            notifyMapped: () => this._relayout(),
        });

        this._sourceActor = props.sourceActor;
        this._label = new Widgets.Label({
            text: props.label,
            yAlign: Clutter.ActorAlign.START,
            xAlign: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this._label);

        this._sourceActor.connectObject(
            'notify::allocation', () => this._relayout(),
            'notify::mapped', () => this._updateOpen(),
            'destroy', () => this.destroy(),
            this,
        );
    }

    private _relayout() {
        const sourceExtents = this._sourceActor.get_transformed_extents();

        const width = Math.max(sourceExtents.get_width(), this._label.width);
        const height = sourceExtents.get_height() + this._label.height;

        this.set_size(width, height);
        this.set_position(
            sourceExtents.get_x() + sourceExtents.get_width() / 2 - width / 2,
            sourceExtents.get_y() - this._label.height,
        );
    }

    open() {
        this._open = true;
        this._updateOpen()
    }

    close() {
        this._open = false;
        this._updateOpen()
    }

    private get _isActuallyOpen() {
        return this.get_parent() !== null;
    }

    private get _shouldBeOpen() {
        return this._open && this._sourceActor.mapped;
    }

    private _updateOpen() {
        if (this._shouldBeOpen && !this._isActuallyOpen) {
            Main.layoutManager.addTopChrome(this);
        } else if (!this._shouldBeOpen && this._isActuallyOpen) {
            Main.layoutManager.removeChrome(this);
        }
    }

    vfunc_pick(pick_context: Clutter.PickContext) {
        // By not making any call to this.pick_box(...) here, we make this actor pass through all events to
        // any actor potentially below it.
        return;
    }
}

