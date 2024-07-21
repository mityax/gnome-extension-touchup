import GLib from "@girs/glib-2.0";
import Gio from "@girs/gio-2.0";
import GnomeTouchExtension from "../extension";

export const logFile = GLib.getenv('GNOMETOUCH_LOGFILE') ?? '/tmp/gnometouch.log';  // TODO: remove default value


export function log(...text: any[]) {
    console.log("GJS:gnometouch:", ...text.map(item => {
        if (item && item instanceof Error) {
            console.error(item, item.message || '', "\n", item.stack)
        }

        return repr(item);
    }));

    const msg = text.map(item => {
        return item && item instanceof Error
            ? `Error (${item}): ` + (item.message || '')
            : repr(item);
    }).join(" ");

    if (logFile) {
        const stream = Gio.File.new_for_path(logFile).append_to(Gio.FileCreateFlags.NONE, null);

        // @ts-ignore
        stream.write_bytes(new GLib.Bytes(`${new Date().toISOString()}: ${msg}\n`), null);
    }

    for(let cb of logCallbacks.values()) {
        cb(msg);
    }
}


export function debugLog(...text: any[]) {
    if (GnomeTouchExtension.isDebugMode || logFile) {
        log(...text);
    }
}


/**
 * Tries to convert anything into a string representation that provides suitable debugging
 * information to developers
 */
export function repr(item: any): string {
    if (item === '') return "<empty string>";
    if (typeof item === 'symbol') return `<#${item.description}>`;

    if (['number', 'string'].indexOf(typeof item) !== -1) return `${item}`;

    let json;
    try {
        if (typeof item === 'object' || Array.isArray(item)) {
            json = JSON.stringify(item);
        }
    } catch (e) {}

    if (item && typeof item === 'object' && item.constructor && item.constructor.name) {
        if (json) {
            return `<${item.constructor.name} object ${json.length > 300 ? json.substring(0, 300) + ' [...]' : json}>`;
        } else {
            return `<${item.constructor.name} object (not stringifyable)>`;
        }
    }

    return json || `${item}`;
}


const logCallbacks = new Map<number, (msg: string) => void>();

/**
 * Add a log callback
 */
export function addLogCallback(callback: (msg: string) => void) {
    const key = Date.now() + Math.random();
    logCallbacks.set(key, callback);
    return key;
}

export function removeLogCallback(id: number) {
    logCallbacks.delete(id);
}

