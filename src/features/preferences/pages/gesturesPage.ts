import Gtk from "gi://Gtk";
import Adw from "gi://Adw";
import GObject from "gi://GObject";
import {settings} from "$src/settings";
import {buildPreferencesGroup, buildSpinRow, buildSwitchRow} from "$src/features/preferences/uiUtils";


export class GesturesPage extends Adw.PreferencesPage {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super({
            name: 'gestures',
            title: "Gestures",
            icon_name: "gesture-swipe-right-symbolic",
        });

        this.add(buildPreferencesGroup({
            title: "Notification Gestures",
            description: "Notification swipe gestures allow you to expand, collapse or swipe away " +
                "notifications using your touch screen.",
            children: [
                buildSwitchRow({
                    title: "Enable Notification Gestures",
                    subtitle: "Toggle to enable or disable the notification gestures feature",
                    setting: settings.notificationGestures.enabled,
                }),
            ]
        }));

        this.add(buildPreferencesGroup({
            title: "Panel Menu Gestures",
            description: "Smoothly open and close panel menus such as quick settings or notification tray via swipe " +
                "gestures.",
            children: [
                buildSwitchRow({
                    title: "Enable Panel Menu Gestures",
                    subtitle: "Toggle to enable or disable the panel menu gestures feature",
                    setting: settings.panel.panelMenusSwipeToOpenEnabled,
                }),
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
            title: "Double Tap To Sleep",
            description: "Double tap the lockscreen, panel or desktop background to gently lock and " +
                "put your device to sleep.",
            children: [
                buildSwitchRow({
                    title: "Enable Double Tap To Sleep",
                    subtitle: "Toggle to enable or disable the double tap to sleep feature",
                    setting: settings.doubleTapToSleep.enabled,
                }),
            ]
        }));

        BETA:
            this.add(buildPreferencesGroup({
                title: "DashToDock Swipe Up Gesture",
                description: "Slightly swipe up the gesture navigation bar to easily open the dock. This feature " +
                    "requires the DashToDock extension.",
                children: [
                    buildSwitchRow({
                        title: "Enable DashToDock Swipe Up Gesture",
                        subtitle: "Toggle to enable or disable the DashToDock swipe up gesture",
                        setting: settings.integrations.dashToDock.enabled,
                    }),
                    buildSpinRow({
                        title: 'Swipe Distance Threshold',
                        subtitle: 'Adjust how far you can swipe the dock before the overview gesture begins',
                        adjustment: new Gtk.Adjustment({
                            lower: settings.integrations.dashToDock.gestureThresholdFactor.min,
                            upper: settings.integrations.dashToDock.gestureThresholdFactor.max,
                            step_increment: 1,
                        }),
                        setting: settings.integrations.dashToDock.gestureThresholdFactor,
                    }),
                ]
            }));
    }
}
