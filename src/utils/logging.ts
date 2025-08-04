import GLib from "gi://GLib";
import Gio from "gi://Gio";
import {logFile} from "$src/config";


/**
 * Log the given arguments to the console and the logfile (if given), together with a timestamp.
 *
 * Note: This function is **not** optimized for speed (!)
 */
export function log(...text: any[]): string {
    if (text.length < 1) return '';

    console.log("[touchup] ", ...text.map(item => {
        if (item && item instanceof Error) {
            console.error(item, item.message || '', "\n", item.stack)
        }

        return repr(item);
    }));

    let msg = text.map(item => {
        return item && item instanceof Error
            ? `Error (${item}): ` + (item.message || '')
            : repr(item);
    }).join(" ");

    // If the last item is an error, we append its stack trace to the log message:
    if (text.at(-1) instanceof Error && text.at(-1).stack) {
        msg += '\n' + text.at(-1).stack.trim();
    }

    if (logFile) {
        const stream = Gio.File.new_for_path(logFile).append_to(Gio.FileCreateFlags.NONE, null);

        // @ts-ignore
        stream.write_bytes(new GLib.Bytes(`${new Date().toISOString()}: ${msg}\n`), null);
    }

    for(let cb of logCallbacks.values()) {
        cb(msg);
    }

    return msg;
}


/**
 * Log the given arguments, together with a timestamp, to the logfile (if given), and (if in debug mode) also to the console.
 *
 * Note: This function is **not** optimized for speed (!)
 */
export function debugLog(...text: any[]): string | null {
    DEBUG: return log(...text);
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
        if (item instanceof Error) {
            return `<${item.constructor.name} object ${item.message ? '– "' + item.message + '"' : ' (no error message)'}>`;
        } else if (json) {
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

/**
 * Throw an error if the given condition is not true.
 *
 * This is a no-op in release builds.
 */
export function assert(condition: boolean, message?: string | {isWarning: boolean, message: string}) {
    DEBUG: if (!condition) {
        if (!message || typeof message === 'string') {
            throw new Error(message ?? "Assertion error");
        } else if (typeof message === 'object') {
            if (message.isWarning) {
                debugLog("WARNING:", message.message);
            } else {
                throw new Error(message.message);
            }
        }
    }
}