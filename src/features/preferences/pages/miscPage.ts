import Adw from "gi://Adw";
import GObject from "gi://GObject";
import {settings} from "$src/settings";
import {buildPreferencesGroup, buildSwitchRow} from "$src/features/preferences/uiUtils";

export class MiscPage extends Adw.PreferencesPage {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super({
            name: 'misc',
            title: "Other",
            icon_name: "preferences-other-symbolic",
        });

        this.add(buildPreferencesGroup({
            title: "Floating Screen Rotate Button",
            description: "When auto-rotate is off, rotating your device triggers a temporary floating button in the " +
                "corner of the screen, offering a quick way to adjust orientation.",
            children: [
                buildSwitchRow({
                    title: "Enable Floating Screen Rotate Button",
                    subtitle: "Toggle to enable or disable the floating screen rotate button feature",
                    setting: settings.screenRotateUtils.floatingScreenRotateButtonEnabled
                }),
            ]
        }));

        BETA:
            this.add(buildPreferencesGroup({
                title: "Virtual Touchpad",
                description: "Use your devices as a touchpad when connected to an external monitor.",
                children: [
                    buildSwitchRow({
                        title: "Enable Virtual Touchpad",
                        subtitle: "Toggle to enable or disable the virtual touchpad feature",
                        setting: settings.virtualTouchpad.enabled,
                    }),
                ]
            }));
    }
}
