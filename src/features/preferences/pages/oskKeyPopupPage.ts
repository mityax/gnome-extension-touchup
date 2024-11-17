import Adw from "gi://Adw";
import GObject from "gi://GObject";
import {settings} from "../settings";


export class OskKeyPopupPage extends Adw.PreferencesPage {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super({
            title: "OSK Key Popups",
            icon_name: "input-keyboard-symbolic",
        });

        // Create a group for the main settings
        const navGroup = new Adw.PreferencesGroup({
            title: "OSK Key Popups",
            description: "Configure the popups appearing when pressing a button in the On-Screen-Keyboard (OSK).",
        });
        this.add(navGroup);

        // Enable Navigation Bar - Toggle Switch
        const enablePopupsRow = new Adw.SwitchRow({
            title: "Enable OSK Key Popups",
            subtitle: "Toggle to enable or disable the OSK key popup feature",
        });
        navGroup.add(enablePopupsRow);
        settings.oskKeyPopups.enabled.bind(enablePopupsRow, 'active');
    }
}
