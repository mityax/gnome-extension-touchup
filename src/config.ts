import GLib from "gi://GLib";

export const logFile = GLib.getenv('GNOMETOUCH_LOGFILE');

export const devMode = ['true', 'yes', '1'].includes(GLib.getenv('GNOMETOUCH_DEV_MODE') ?? 'false');

export const assetsGResourceFile = 'assets.gresource';

/**
 * Path configuration for the resources embedded in [assetsGResourceFile]
 */
export const assetPath = Object.freeze({
    root: 'resource:///org/gnome/shell/extensions/gnometouch',
    icon: (name: string) => `resource:///org/gnome/shell/extensions/gnometouch/icons/scalable/actions/${name}.svg`,
});

/**
 * All platforms users can use to donate
 */
export const donationPlatforms = Object.freeze([
    {
        name: 'Ko-fi',
        url: 'https://ko-fi.com/mityax',
        description: 'Most payment methods, one-time or recurring donations, no sign up required.',
        recommended: true,
    },
    {
        name: 'Patreon',
        url: 'https://www.patreon.com/mityax',
        description: 'Many payment methods, best for a recurring donation.',
    },
    {
        name: 'Buy Me A Coffee',
        url: 'https://buymeacoffee.com/mityax',
        description: 'Donate by card, no sign up required.',
    },
]);

export const feedbackPlatforms = Object.freeze([
    {
        title: 'Create an Issue on GitHub',
        url: 'https://github.com/mityax/gnome-touch/issues/new',
        buttonLabel: 'Create Issue',
    },
    // TODO: provide this to make it show up in the settings
    //{
    //    title: 'Leave a Review on Gnome Extensions',
    //    url: 'todo',
    //    buttonLabel: 'Leave Review',
    //},
]);
