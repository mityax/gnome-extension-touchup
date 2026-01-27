import GLib from "gi://GLib";

export const logFile = GLib.getenv('TOUCHUP_LOGFILE');

export const devMode = ['true', 'yes', '1'].includes(GLib.getenv('TOUCHUP_DEV_MODE') ?? 'false');

export const assetsGResourceFile = 'assets.gresource';

/**
 * Path configuration for the resources embedded in [assetsGResourceFile]
 */
export const assetPath = Object.freeze({
    root: 'resource:///org/gnome/shell/extensions/touchup',
    icon: (name: string) => `resource:///org/gnome/shell/extensions/touchup/icons/scalable/actions/${name}.svg`,
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
        name: 'Buy Me A Coffee',
        url: 'https://buymeacoffee.com/mityax',
        description: 'Donate by card, no sign up required.',
    },
]);

export const feedbackPlatforms = Object.freeze([
    {
        title: 'Create an Issue on GitHub',
        url: 'https://github.com/mityax/gnome-extension-touchup/issues/new',
        buttonLabel: 'Create Issue',
    },
    {
        title: 'Leave a review on Gnome Extensions',
        url: 'https://extensions.gnome.org/extension/8102',
        buttonLabel: 'Leave Review',
    },
]);

/** How fast (in prog/ms) the overview follows the users finger during gestures (i.e. vertical speed) */
export const overviewGestureMaxSpeed = 0.004;

/** How fast (in prog/ms) the workspace follows the users finger during gestures (i.e. horizontal speed) */
export const workspaceGestureMaxSpeed = 0.0012;
