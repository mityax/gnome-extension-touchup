import Adw from "gi://Adw";
import GObject from "gi://GObject";
import {settings} from "$src/settings.ts";
import {buildPreferencesGroup, buildSwitchRow, buildToggleButtonRow} from "$src/features/preferences/uiUtils.ts";


export class NavigationBarPage extends Adw.PreferencesPage {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super({
            title: "Navigation Bar",
            icon_name: "computer-apple-ipad-symbolic",
        });

        this.add(buildPreferencesGroup({
            title: "Navigation Bar",
            description: "Configure the behavior and appearance of the navigation bar",
            children: [
                buildSwitchRow({
                    title: "Enable Navigation Bar",
                    subtitle: "Toggle to enable or disable the navigation bar feature",
                    setting: settings.navigationBar.enabled,
                }),
                buildToggleButtonRow<'gestures' | 'buttons'>({
                    title: "Navigation Bar Mode",
                    subtitle: "Choose which kind of navigation experience you prefer",
                    items: [
                        { label: "Gestures", value: "gestures" },
                        { label: "Buttons", value: "buttons" },
                    ],
                    setting: settings.navigationBar.mode,
                }),
            ]
        }));

        this.add(buildPreferencesGroup({
            title: "Gestures Navigation Bar",
            children: [
                buildSwitchRow({
                    title: "Reserve Space",
                    subtitle: "Keep space available for the navigation bar to avoid overlaying windows. If disabled, " +
                        "the navigation bar is shown on top of overlapping windows and adjusts its color dynamically.",
                    setting: settings.navigationBar.gesturesReserveSpace,
                }),
            ],
            // Only show this group when mode is set to "gestures":
            onCreated: (group) => {
                const id = settings.navigationBar.mode.connect("changed", (mode) => group.visible = mode === 'gestures');
                group.connect('destroy', () => settings.navigationBar.mode.disconnect(id));
            },
        }));

        // TODO: implement configurable layouts
        /*
        type navbarButtonsGroupButtons = SettingsType<typeof settings.navigationBar.buttonsLeft>;

        buttonBarGroup.add(buildToggleButtonRow<[navbarButtonsGroupButtons, navbarButtonsGroupButtons, navbarButtonsGroupButtons]>({
            title: "Navigation Bar Mode",
            subtitle: "Choose which kind of navigation experience you prefer",
            setting: 
        }));
        */
    }
}
