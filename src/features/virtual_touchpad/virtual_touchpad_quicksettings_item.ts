import '@girs/gnome-shell/extensions/global';
import GObject from "@girs/gobject-2.0";
import {QuickSettingsItem} from "@girs/gnome-shell/ui/quickSettings";

import * as Main from '@girs/gnome-shell/ui/main';
import Meta from "@girs/meta-15";
import GLib from "@girs/glib-2.0";

export class VirtualTouchpadQuickSettingsItem extends QuickSettingsItem {
    static {
        GObject.registerClass(this);
    }

    constructor(onPress: () => void) {
        super({
            styleClass: 'icon-button',
            canFocus: true,
            iconName: 'input-touchpad-symbolic',
            visible: !Main.sessionMode.isGreeter,  // TODO: potentially adjust when greeter is supported
            accessibleName: 'Open virtual touchpad',
        });

        this.connect('clicked', () => {
            const topMenu = Main.panel.statusArea.quickSettings.menu;
            const laters = global.compositor.get_laters();
            laters.add(Meta.LaterType.BEFORE_REDRAW, () => {
                onPress();
                return GLib.SOURCE_REMOVE;
            });
            topMenu.close();
        });
    }
}