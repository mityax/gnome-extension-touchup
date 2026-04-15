import Adw from "gi://Adw";
import GObject from "gi://GObject";
import {settings} from "$src/settings";
import Gtk from "gi://Gtk";
import {
    buildPreferencesGroup,
    buildSpinRow,
    buildSwitchRow,
    buildToggleButtonRow
} from "$src/features/preferences/uiUtils";

export class OskPage extends Adw.PreferencesPage {
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
                    subtitle: "Enable this if you'd like to swipe down the OSK to smoothly close it",
                    setting: settings.osk.gestures.swipeToClose.enabled,
                }),
                buildSwitchRow({
                    title: "Enable Extended Keys",
                    subtitle: "Taps near to or between keys will register as keypresses, helping you avoid missed " +
                        "keys",
                    setting: settings.osk.gestures.extendKeys.enabled,
                }),
            ]
        }));

        this.add(buildPreferencesGroup({
            title: "Quick Paste Action",
            description: "Show a quick paste action button in the OSK suggestion bar when having copied " +
                "something to the clipboard recently.",
            children: [
                buildSwitchRow({
                    title: "Enable OSK Quick Paste Action",
                    subtitle: "Whether to enable the OSK quick paste action button or not",
                    setting: settings.osk.quickPasteAction.enabled,
                }),
            ]
        }));

        this.add(buildPreferencesGroup({
            title: "Space Bar IME Switching",
            description: "Switch keyboard layouts by swiping the space bar.",
            children: [
                buildSwitchRow({
                    title: "Enable Space Bar IME Switching",
                    subtitle: "Whether to enable the space bar IME switching gesture or not",
                    setting: settings.osk.spaceBarIMESwitching.enabled,
                }),
                buildToggleButtonRow({
                    title: "Space Bar IME Indicator Mode",
                    subtitle: "Choose which layouts to show in the space bar",
                    items: [
                        { label: 'All',     value: 'all' },
                        { label: 'Current', value: 'current' },
                        { label: 'None',    value: 'none' },
                    ],
                    setting: settings.osk.spaceBarIMESwitching.indicatorMode,
                }),
            ]
        }));
    }
}
