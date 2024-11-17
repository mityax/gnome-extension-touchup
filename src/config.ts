import GLib from "gi://GLib";


export const kDebugMode = /^(true|1|yes)$/.test(GLib.getenv('GNOMETOUCH_DEBUG_MODE') || 'false');
export const logFile = GLib.getenv('GNOMETOUCH_LOGFILE') ?? '/tmp/gnometouch.log';  // TODO: remove default value
