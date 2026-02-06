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


        this.add(buildPreferencesGroup({
            title: "Desktop and Overview Gestures",
            description: "Fine-tune which gestures you would like to use on desktop background and in the overview.",
            children: [
                buildSwitchRow({
                    title: "Enable Desktop Background Gestures",
                    subtitle: "Navigate by single-finger swiping on the desktop background",
                    setting: settings.backgroundNavigationGestures.desktopBackgroundGesturesEnabled,
                }),
                buildSwitchRow({
                    title: "Enable Overview Background Gestures",
                    subtitle: "Navigate by single-finger swiping on the overview background",
                    setting: settings.backgroundNavigationGestures.overviewBackgroundGesturesEnabled,
                }),
                buildSwitchRow({
                    title: "Enable Swipe-Up-To-Close Windows",
                    subtitle: "Close windows by swiping them up in the overview, long-press and drag to move",
                    setting: settings.backgroundNavigationGestures.windowPreviewGesturesEnabled,
                }),
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

        this.add(buildPreferencesGroup({
            title: "Double Tap To Sleep",
            description: "Double tap the panel or desktop background to gently lock and put your device to sleep.",
            children: [
                buildSwitchRow({
                    title: "Enable Double Tap To Sleep",
                    subtitle: "Toggle to enable or disable the double tap to sleep feature",
                    setting: settings.screenRotateUtils.floatingScreenRotateButtonEnabled
                })
            ]
        }));
    }
}
