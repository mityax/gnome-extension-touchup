import St from "gi://St";
import GObject from "gi://GObject";
import {DevToolButton} from "$src/features/developmentTools/developmentToolButton";
import {Source, Urgency} from "resource:///org/gnome/shell/ui/messageTray.js";
import {NotificationDestroyedReason} from "@girs/gnome-shell/ui/messageTray";
import {randomChoice} from "$src/utils/utils";
import TouchUpExtension from "$src/extension";
import {NotificationService} from "$src/services/notificationService";


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
        const notificationService = TouchUpExtension.instance!.getFeature(NotificationService)!;
        const notification = notificationService.create({
            title: randomChoice(["A test!", "Test Notification", "Just a Test", "A Quick Test"]),
            body: randomChoice([
                "This is a notification to test something in TouchUp.",
                "This notification to test something in TouchUp has an expandable body text. It has been " +
                "triggered using the TouchUp DevTools which can only be used during development."]),
            urgency: Urgency.NORMAL,
        });
        notificationService.show(notification);
    }

    vfunc_destroy() {
        SendTestNotificationsButton.notificationSource?.destroy(NotificationDestroyedReason.SOURCE_CLOSED);
        super.vfunc_destroy();
    }
}

