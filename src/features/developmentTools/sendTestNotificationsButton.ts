import St from "gi://St";
import GObject from "gi://GObject";
import {DevToolButton} from "$src/features/developmentTools/developmentToolButton";
import {Notification, Source, Urgency} from "resource:///org/gnome/shell/ui/messageTray.js";
import Gio from "gi://Gio";
import {NotificationDestroyedReason, NotificationGenericPolicy} from "@girs/gnome-shell/ui/messageTray";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import {AssetIcon} from "$src/utils/ui/assetIcon";
import {randomChoice} from "$src/utils/utils";


export class SendTestNotificationsButton extends DevToolButton {
    private static notificationSource?: Source;

    static {
        GObject.registerClass(this);
    }

    constructor() {
        super({
            label: 'Send test notifications',
            icon: new St.Icon({
                iconName: 'mail-message-new-symbolic',
                iconSize: 16,
            }),
            onPressed: () => this._onPressed(),
        });
    }

    private async _onPressed() {
        const notification = new Notification({
            source: this.getNotificationSource(),
            title: randomChoice(["A test!", "Test Notification", "Just a Test", "A Quick Test"]),
            body: randomChoice([
                "This is a notification to test something in GnomeTouch.",
                "This notification to test something in GnomeTouch has an expandable body text. It has been " +
                "triggered using the GnomeTouch DevTools which can only be used during development."]),
            gicon: new AssetIcon('positive-feedback-symbolic'),
            urgency: Urgency.NORMAL,
        });
        this.getNotificationSource()?.addNotification(notification);
    }

    private getNotificationSource(): Source | null {
        if (!SendTestNotificationsButton.notificationSource) {
            SendTestNotificationsButton.notificationSource = new Source({
                title: 'GnomeTouch DevTools',
                // An icon for the source, used a fallback by notifications
                icon: new Gio.ThemedIcon({name: 'dialog-information'}),
                iconName: 'dialog-information',
                policy: new NotificationGenericPolicy(),
            });

            Main.messageTray.add(SendTestNotificationsButton.notificationSource!);

            // Reset the notification source if it's destroyed
            SendTestNotificationsButton.notificationSource.connect('destroy', _source =>
                SendTestNotificationsButton.notificationSource = undefined);
        }

        return SendTestNotificationsButton.notificationSource ?? null;
    }

    vfunc_destroy() {
        SendTestNotificationsButton.notificationSource?.destroy(NotificationDestroyedReason.SOURCE_CLOSED);
        super.vfunc_destroy();
    }
}

