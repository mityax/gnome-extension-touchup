import Adw from "gi://Adw";
import GObject from "gi://GObject";
import {settings} from "$src/settings";
import Gtk from "gi://Gtk";
import {
    buildComboRow,
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
                buildToggleButtonRow({
                    title: "Popup Style",
                    subtitle: "Specify how prominent key popups should be",
                    items: [
                        { label: "Accent", value: "accent" },
                        { label: "Subtle", value: "subtle" },
                    ],
                    setting: settings.osk.keyPopups.style,
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
            title: "Space Bar & Backspace Swipes",
            description: "Slide across the space bar to move the cursor or switch layouts, and across " +
                "the backspace key to select whole words and delete them.",
            children: [
                buildComboRow({
                    title: "Space Bar Swipe",
                    subtitle: "What sliding horizontally across the space bar does",
                    items: [
                        { label: "Move cursor (2nd finger tap selects)", value: "cursor" },
                        { label: "Switch keyboard layout (IME)", value: "ime" },
                        { label: "Do nothing", value: "none" },
                    ],
                    setting: settings.osk.swipeGestures.spaceAction,
                }),
                buildComboRow({
                    title: "Space Bar IME Indicator",
                    subtitle: "Which layouts to show in the space bar when switching layouts by swiping",
                    items: [
                        { label: 'All',     value: 'all' },
                        { label: 'Current', value: 'current' },
                        { label: 'None',    value: 'none' },
                    ],
                    setting: settings.osk.spaceBarIMESwitching.indicatorMode,
                }),
                buildSwitchRow({
                    title: "Backspace Swipe",
                    subtitle: "Slide left across the backspace key to select whole words; releasing " +
                        "deletes the selection. A tap still deletes one character.",
                    setting: settings.osk.swipeGestures.backspace,
                }),
                buildSpinRow({
                    title: "Swipe Sensitivity",
                    subtitle: "How far the cursor moves, or how many words are selected, for a given slide",
                    setting: settings.osk.swipeGestures.sensitivity,
                    adjustment: new Gtk.Adjustment({
                        lower: settings.osk.swipeGestures.sensitivity.min,
                        upper: settings.osk.swipeGestures.sensitivity.max,
                        step_increment: 1,
                        page_increment: 1,
                    }),
                }),
            ]
        }));
    }
}
