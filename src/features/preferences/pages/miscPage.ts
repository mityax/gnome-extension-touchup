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
            title: "Notification Gestures",
            description: "Notification swipe gestures allow you to expand, collapse or swipe away " +
                "notifications using your touch screen.",
            children: [
                buildSwitchRow({
                    title: "Enable Notification Gestures",
                    subtitle: "Toggle to enable or disable the notification gestures feature",
                    setting: settings.notificationGestures.enabled
                })
            ]
        }));

        BETA: this.add(buildPreferencesGroup({
            title: "Overview Gestures",
            description: "Control overview and app list or close apps using intuitive swipe gestures " +
                "on your desktop background and in the overview.",
            children: [
                buildSwitchRow({
                    title: "Enable Overview Gestures",
                    subtitle: "Toggle to enable or disable the overview gestures feature",
                    setting: settings.overviewGestures.enabled
                })
            ]
        }));

        this.add(buildPreferencesGroup({
            title: "Floating Screen Rotate Button",
            description: "When auto-rotate is off, rotating your device triggers a temporary floating button in the " +
                "corner of the screen, offering a quick way to adjust orientation.",
            children: [
                buildSwitchRow({
                    title: "Enable Floating Screen Rotate Button",
                    subtitle: "Toggle to enable or disable the floating screen rotate button feature",
                    setting: settings.screenRotateUtils.floatingScreenRotateButtonEnabled
                })
            ]
        }));
    }
}
