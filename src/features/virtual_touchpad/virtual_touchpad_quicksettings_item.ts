import '@girs/gnome-shell/extensions/global';
import GObject from "gi://GObject";
import {QuickSettingsItem} from "resource:///org/gnome/shell/ui/quickSettings.js";

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Meta from "gi://Meta";
import GLib from "gi://GLib";

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