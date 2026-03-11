// SPDX-FileCopyrightText: 2026 mityax, 2026
//
// SPDX-License-Identifier: GPL-3.0-only

import Adw from "gi://Adw";
import GObject from "gi://GObject";
import {settings} from "$src/settings";
import Gtk from "gi://Gtk";
import {buildPreferencesGroup, buildSpinRow, buildSwitchRow} from "$src/features/preferences/uiUtils";

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
    }
}
