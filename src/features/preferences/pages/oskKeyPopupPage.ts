import Adw from "gi://Adw";
import GObject from "gi://GObject";
import {settings} from "$src/settings";
import Gtk from "gi://Gtk";
import {buildPreferencesGroup, buildSpinRow, buildSwitchRow} from "$src/features/preferences/uiUtils";

export class OskKeyPopupPage extends Adw.PreferencesPage {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super({
            name: 'osk',
            title: "OSK",
            icon_name: "input-keyboard-symbolic",
        });

        this.add(buildPreferencesGroup({
            title: "OSK Key Popups",
            description: "Configure the popups appearing when pressing a button in the On-Screen-Keyboard (OSK).",
            children: [
                buildSwitchRow({
                    title: "Enable OSK Key Popups",
                    subtitle: "Toggle to enable or disable the OSK key popup feature",
                    setting: settings.osk.keyPopups.enabled
                }),
                buildSpinRow({
                    title: "Popup Duration",
                    subtitle: "Set how long (in milliseconds) to show the OSK key popups",
                    setting: settings.osk.keyPopups.duration,
                    adjustment: new Gtk.Adjustment({
                        lower: settings.osk.keyPopups.duration.min,
                        upper: settings.osk.keyPopups.duration.max,
                        step_increment: 1,
                        page_increment: 10,
                    }),
                })
            ]
        }));

        this.add(buildPreferencesGroup({
            title: "OSK Gestures",
            description: "Fine-tune how the OSK reacts to touch events.",
            children: [
                buildSwitchRow({
                    title: "Enable Swipe-To-Close",
                    subtitle: "Enable this if you'd like to swipe down on the empty space in the OSK to smoothly " +
                        "close it",
                    setting: settings.osk.gestures.swipeToClose.enabled,
                }),
                buildSwitchRow({
                    title: "Enable Extended Keys",
                    subtitle: "When enabled, the empty space between keys on the on-screen keyboard will also be " +
                        "responsive, making it easier to hit the intended keys",
                    setting: settings.osk.gestures.extendKeys.enabled,
                }),
            ]
        }))
    }
}
