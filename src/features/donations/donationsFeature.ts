import ExtensionFeature from "../../utils/extensionFeature";
import {PatchManager} from "../../utils/patchManager";
import Gio from "gi://Gio";
import {Delay} from "$src/utils/delay.ts";
import {debugLog} from "$src/utils/logging";
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import {randomChoice} from "$src/utils/utils.ts";
import {AssetIcon} from "$src/utils/ui/assetIcon.ts";
import {NotificationGenericPolicy} from "@girs/gnome-shell/ui/messageTray";
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {settings} from "$src/settings.ts";


type InstallationData = {
    installedAt: number,
    promptedForDonationAt?: number | null,
    dontAskAgain?: boolean,
};


export default class DonationsFeature extends ExtensionFeature {
    // Time to wait before showing a donation; this is to not show the donation immediately upon login because
    // the user at that point probably is busy, and we don't want to uselessly annoy them:
    // TODO: change back to 20 mins:
    private static NOTIFICATION_DELAY: number = 3;  // in minutes

    // Time between donation prompt notifications:
    // TODO: change back to 90 days:
    private static NOTIFICATION_INTERVAL: number = 2 * 24 * 60 * 60 * 1000;  // in ms; 90 days (~ quarter of a year)

    private notificationSource?: MessageTray.Source;

    constructor(pm: PatchManager) {
        super(pm);

        // For testing:
        DEBUG: Delay.s(2).then(_ => this.showDonationNotification());  // TODO: comment out

        // Read after a delay to not make this feature slow down startup:
        Delay.ms(700)
            .then(_ => this._initializeInstallationData())
            .then(data => this._maybeScheduleNotification(data));
    }

    private async _initializeInstallationData(): Promise<InstallationData> {
        try {
            const data = await this._readInstallationData();
            debugLog("Installation data: ", data);
            this._validateInstallationData(data);
            return data;
        } catch (e) {
            DEBUG: if (!(e instanceof Gio.IOErrorEnum && e.code == Gio.IOErrorEnum.NOT_FOUND)) {
                debugLog("Error while trying to read installations data: ", e instanceof Gio.IOErrorEnum ? [e.code, e.message] : e);
            }
            const data = {
                installedAt: Date.now(),
                promptedForDonationAt: null,
            } as InstallationData;
            await this._writeInstallationData(data);
            return data;
        }
    }

    private _maybeScheduleNotification(data: InstallationData) {
        if (data.dontAskAgain === true) return;

        const dt = data.promptedForDonationAt ?? data.installedAt;
        if (dt && Date.now() - dt > DonationsFeature.NOTIFICATION_INTERVAL) {
            debugLog(`Scheduling notification in ${DonationsFeature.NOTIFICATION_DELAY} minutes`);
            Delay.min(DonationsFeature.NOTIFICATION_DELAY).then(() => this.showDonationNotification(data));
        }
    }

    /**
     * Show a system notification asking the user to donate.
     */
    private async showDonationNotification(data?: InstallationData): Promise<void> {
        const n = randomChoice(NOTIFICATIONS);
        const notification = new MessageTray.Notification({
            source: this.getNotificationSource(),
            title: n.title,
            body: n.body,
            gicon: new AssetIcon('positive-feedback-symbolic'),
            urgency: MessageTray.Urgency.NORMAL,
        });
        notification.addAction("Learn more", () => {
            debugLog("learn more"); // TODO: implement
        });
        notification.addAction("Don't ask again", async () => {
            await this._writeInstallationData({
                ...(data ?? await this._readInstallationData()),
                dontAskAgain: true,
            });
        });
        notification.addAction("Not now", async () => {
            // Nothing to do here; the notification will be shown again
            // after [NOTIFICATION_INTERVAL] has passed.
        });
        MessageTray.getSystemSource().addNotification(notification);

        await this._writeInstallationData({
            ...(data ?? await this._readInstallationData()),
            promptedForDonationAt: Date.now(),
        });
    }

    private async _readInstallationData(): Promise<InstallationData> {
        return JSON.parse(settings.donations.installationData.get()) as InstallationData;
    }

    private async _writeInstallationData(data: InstallationData) {
        try {
            settings.donations.installationData.set(JSON.stringify(data));
        } catch (e) {
            debugLog("Error while trying to write installation data: ", e instanceof Gio.IOErrorEnum ? [e.code, e.message] : e);
        }
    }

    private _validateInstallationData(data: InstallationData | Record<string, any>) {
        if (typeof data.installedAt !== 'number') {
            throw new Error("Missing or invalid field in installation data: 'installedAt'");
        }
        if (data.promptedForDonationAt != null && !['number', 'undefined'].includes(typeof data.promptedForDonationAt)) {
            throw new Error(`Invalid data type in installation data field 'promptedForDonation': ${typeof data.promptedForDonationAt}`);
        }
        if (data.dontAskAgain != null && !['boolean', 'undefined'].includes(typeof data.dontAskAgain)) {
            throw new Error(`Invalid data type in installation data field 'dontAskAgain': ${typeof data.dontAskAgain}`);
        }
    }

    getNotificationSource(): MessageTray.Source | null {
        if (!this.notificationSource) {
            this.notificationSource = new MessageTray.Source({
                title: 'GnomeTouch',
                // An icon for the source, used a fallback by notifications
                icon: new Gio.ThemedIcon({name: 'dialog-information'}),
                iconName: 'dialog-information',
                policy: new NotificationGenericPolicy(),
            });

            // Reset the notification source if it's destroyed
            this.notificationSource.connect('destroy', _source => {
                this.notificationSource = undefined;
            });
            Main.messageTray.add(this.notificationSource);
        }

        return this.notificationSource ?? null;
    }
}


const NOTIFICATIONS = [
    {
        "title": "Is GnomeTouch helpful for you? 🌟",
        "body": "Support its development by making a donation. Every contribution helps! 💖"
    },
    {
        "title": "Thank you for using GnomeTouch! ❤️",
        "body": "If you find it useful, consider supporting the project with a donation. Click to learn more."
    },
    {
        "title": "Help Keep GnomeTouch Going 🤝",
        "body": "Donations help cover development time and maintenance. Every little bit helps! ❤️"
    },
    {
        "title": "Consider Supporting GnomeTouch 🤝",
        "body": "We rely on your generosity to keep improving. Click here to donate. ❤️"
    },
    {
        "title": "Keep Us Coding! 💻",
        "body": "Your generosity powers innovation and independence. Make a donation today to support GnomeTouch! ❤️"
    },
    {
        "title": "Support Open Source ❤️",
        "body": "Your donations keep open-source projects like GnomeTouch alive. Help us grow! 🌟"
    },
    {
        "title": "Make a Difference 🌍",
        "body": "Your support fuels this project. Donate today to keep GnomeTouch going strong! 💪"
    },
    {
        "title": "Empower Open Platforms ✊",
        "body": "GnomeTouch makes GNOME more useful on tablets – and helps it challenge corporate giants. Your donation strengthens the fight for open software! 🌍"
    },
    {
        "title": "Open Source Needs You! 🛠️",
        "body": "Big Tech monopolies dominate mobile OSes — but you and GnomeTouch can help making GNOME an independent alternative. Donate today!"
    },
    {
        "title": "We have big plans for GnomeTouch... ",
        "body": "... and you can help making it happen! Take a look at what's coming, leave us some new ideas or make us faster with a small donation! 😄",
    },
    {
        "title": "GnomeTouch has a long bucket list! 🪣",
        "body": "Curios what else is coming? Have a look at the planned features and help us realize them with a small donation ❤️"
    }
];


