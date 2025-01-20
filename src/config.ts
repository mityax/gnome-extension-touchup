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
