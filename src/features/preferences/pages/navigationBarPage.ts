import Adw from "@girs/adw-1";
import GObject from "@girs/gobject-2.0";
import Gtk from "@girs/gtk-4.0";
import {settings} from "../settings";


export class NavigationBarPage extends Adw.PreferencesPage {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super({
            title: "Navigation Bar",
            icon_name: "computer-apple-ipad-symbolic",
        });

        // Create a group for the main settings
        const navGroup = new Adw.PreferencesGroup({
            title: "Navigation Bar",
            description: "Configure the behavior and appearance of the navigation bar",
        });
        this.add(navGroup);

        // Enable Navigation Bar - Toggle Switch
        const enableNavBarRow = new Adw.SwitchRow({
            title: "Enable Navigation Bar",
            subtitle: "Toggle to enable or disable the navigation bar feature",
        });
        navGroup.add(enableNavBarRow);
        settings.navigationBar.enabled.bind(enableNavBarRow, 'active');

        // Navigation Bar Mode - Drop-down for gestures or buttons
        const items = [['Gesture-based', 'gestures'], ['Button-based', 'buttons']];
        const navModeRow = new Adw.ComboRow({
            title: "Navigation Bar Mode",
            subtitle: "Choose between gesture navigation or button navigation",
            model: new Gtk.StringList({
                strings: items.map(i => i[0]),
            }),
        });
        navModeRow.set_selected(items.findIndex(i => i[1] === settings.navigationBar.mode.get()))
        navModeRow.connect('notify::selected-item', () => settings.navigationBar.mode.set(items[navModeRow.selected][1] as any))
        navGroup.add(navModeRow);

        // Reserve Space for Navigation Bar - Toggle Switch
        const reserveSpaceRow = new Adw.SwitchRow({
            title: "Reserve Space for Navigation Bar",
            subtitle: "Keep space available for the navigation bar to avoid overlaying content. Ignored if using button navigation.",
        });
        navGroup.add(reserveSpaceRow);
        settings.navigationBar.gesturesReserveSpace.bind(reserveSpaceRow, 'active');
    }
}
