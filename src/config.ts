import GLib from "gi://GLib";

export const logFile = GLib.getenv('GNOMETOUCH_LOGFILE') ?? '/tmp/gnometouch.log';  // TODO: remove default value
