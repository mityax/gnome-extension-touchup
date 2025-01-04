import GLib from "gi://GLib";

export const logFile = GLib.getenv('GNOMETOUCH_LOGFILE') ?? '/tmp/gnometouch.log';  // TODO: remove default value

export const devMode = ['true', 'yes', '1'].includes(GLib.getenv('GNOMETOUCH_DEV_MODE') ?? 'false');
