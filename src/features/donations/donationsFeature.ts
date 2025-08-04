import ExtensionFeature from "../../utils/extensionFeature";
import {PatchManager} from "$src/utils/patchManager";
import Gio from "gi://Gio";
import {Delay} from "$src/utils/delay";
import {debugLog} from "$src/utils/logging";
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import {randomChoice} from "$src/utils/utils";
import {AssetIcon} from "$src/utils/ui/assetIcon";
import {settings} from "$src/settings";
import TouchUpExtension from "$src/extension";
import * as Widgets from "$src/utils/ui/widgets";
import {css} from "$src/utils/ui/css";
import showToast from "$src/utils/ui/toast";
import NotificationService from "$src/services/notificationService";


type InstallationData = {
    installedAt: number,
    promptedForDonationAt?: number | null,
    dontAskAgain?: boolean,
};


export class DonationsFeature extends ExtensionFeature {
    // Time to wait before showing a donation; this is to not show the donation immediately upon login because
    // the user at that point probably is busy, and we don't want to uselessly annoy them:
    private static NOTIFICATION_DELAY: number = 20;  // in minutes

    // Time between donation prompt notifications:
    private static NOTIFICATION_INTERVAL: number = 90 * 24 * 60 * 60 * 1000;  // in ms; 90 days (~ quarter of a year)

    constructor(pm: PatchManager) {
        super(pm);

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
                debugLog("Error while trying to read installations data: ", e);
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
     * Show a panel notification asking the user to donate.
     */
    private async showDonationNotification(data?: InstallationData): Promise<void> {
        const notificationService = TouchUpExtension.instance!.getFeature(NotificationService)!;
        const n = randomChoice(NOTIFICATION_VARIANTS);

        const notification = notificationService.create({
            title: n.title,
            body: n.body,
            gicon: new AssetIcon('positive-feedback-symbolic'),
            urgency: MessageTray.Urgency.NORMAL,
        });
        notification.connect('activated', () => this.openDonationPage());
        notification.addAction("Learn more", () => this.openDonationPage());
        notification.addAction("Not now", async () => {
            showToast("No problem – you'll receive a notification in a few months again!", [
                new Widgets.Button({
                    label: 'Never ask again',
                    styleClass: 'button',
                    onClicked: async () => await this._writeInstallationData({
                        ...(data ?? await this._readInstallationData()),
                        dontAskAgain: true,
                    }),
                }),
                new Widgets.Button({
                    iconName: 'window-close-symbolic',
                    style: css({ height: '10px' }),
                }),
            ]);
        });

        notificationService.show(notification);

        await this._writeInstallationData({
            ...(data ?? await this._readInstallationData()),
            promptedForDonationAt: Date.now(),
        });
    }

    private openDonationPage() {
        if (!TouchUpExtension.instance) return;
        settings.initialPreferencesPage.set('donations');
        TouchUpExtension.instance!.openPreferences();
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
}


const NOTIFICATION_VARIANTS = [
    {
        "title": "Is TouchUp helpful for you? 🌟",
        "body": "Support its development by making a donation. Every contribution helps! 💖"
    },
    {
        "title": "Thank you for using TouchUp! ❤️",
        "body": "If you find it useful, consider supporting the project with a donation. Click to learn more."
    },
    {
        "title": "Help Keep TouchUp Going 🤝",
        "body": "Donations help cover development time and maintenance. Every little bit helps! ❤️"
    },
    {
        "title": "Consider Supporting TouchUp 🤝",
        "body": "We rely on your generosity to keep improving. Click here to donate. ❤️"
    },
    {
        "title": "Keep Us Coding! 💻",
        "body": "Your generosity powers innovation and independence. Make a donation today to support TouchUp! ❤️"
    },
    {
        "title": "Support Open Source ❤️",
        "body": "Your donations keep open-source projects like TouchUp alive. Help us grow! 🌟"
    },
    {
        "title": "Make a Difference 🌍",
        "body": "Your support fuels this project. Donate today to keep TouchUp going strong! 💪"
    },
    {
        "title": "Empower Open Platforms ✊",
        "body": "TouchUp makes GNOME more useful on tablets – and helps it challenge corporate giants. Your donation strengthens the fight for open software! 🌍"
    },
    {
        "title": "Open Source Needs You! 🛠️",
        "body": "Big Tech monopolies dominate mobile OSes — but you and TouchUp can help making GNOME an independent alternative. Donate today!"
    },
    {
        "title": "We have big plans for TouchUp... ",
        "body": "... and you can help making it happen! Take a look at what's coming, leave us some new ideas or make us faster with a small donation! 😄",
    },
    {
        "title": "TouchUp has a long bucket list! 🪣",
        "body": "Curios what else is coming? Have a look at the planned features and help us realize them with a small donation ❤️"
    }
];


