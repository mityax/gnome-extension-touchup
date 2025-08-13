import GLib from "gi://GLib";
import Gio from "gi://Gio";
import {logFile} from "$src/config";


export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogCallback = (msg: LogCallbackArguments) => void;
export type LogCallbackArguments = {
    level: LogLevel,
    tag: string,
    formattedMessage: string,
    rawArguments: any[],
};

/**
 * The several log methods of this class log text to the console and, if given, to the global
 * logfile for this extension.
 *
 * Note: The logging methods are **not** optimized for speed (!)
 */
export class Logger {
    static instance = new Logger('touchup');

    private constructor(private tag: string) {}

    /**
     * Log a debug-level message.
     *
     * This is a no-op in release builds.
     */
    debug(...text: any) {
        DEBUG: this._log('debug', this._formatTag(), ...text);
    }

    /**
     * Perform an info-level log.
     */
    info(...text: any) {
        this._log('info', this._formatTag(), ...text);
    }

    /**
     * Log a warning message.
     */
    warn(...text: any) {
        this._log('warn', this._formatTag(), 'WARNING:', ...text);
    }

    /**
     * Log an error. The stacktrace is printed if the error instance is given as the last argument, e.g.:
     *
     * ```ts
     * try {
     *     foo()
     * } catch (e) {
     *     logger.error('An error occurred while doing foo:', error);
     * }
     * ```
     */
    error(...text: any) {
        this._log('error', this._formatTag(), 'ERROR:', ...text);
    }

    private _log(level: LogLevel, tag: string, ...text: any[]): string {
        if (text.length < 1) return '';

        const consoleLogFn= {
            debug: console.debug,
            info: console.log,
            warn: console.warn,
            error: console.error,
        }[level];

        let msg = text.map(item => {
            return item && item instanceof Error
                ? `${item.name}: ${(item.message || '')}`
                : repr(item);
        }).join(" ");

        // If the last item is an error, we append its stack trace to the log message:
        if (text.at(-1) instanceof Error && text.at(-1).stack) {
            msg += '\n' + text.at(-1).stack.trim();
        }

        consoleLogFn(tag, msg);

        if (logFile) {
            const stream = Gio.File.new_for_path(logFile).append_to(Gio.FileCreateFlags.NONE, null);

            // @ts-ignore
            stream.write_bytes(new GLib.Bytes(`${new Date().toISOString()}: ${msg}\n`), null);
        }

        for(let cb of logCallbacks.values()) {
            cb({
                level: level,
                tag: tag,
                formattedMessage: msg,
                rawArguments: text,
            });
        }

        return msg;
    }

    private _formatTag(subtag?: string) {
        return `[${this.tag}${subtag ? `:${subtag}` : ''}]`;
    }
}


export const logger = Logger.instance;


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
        } else if (item instanceof Gio.IOErrorEnum) {
            return `<Gio.IOErrorEnum {code: ${item.code}, message: ${item.message}}>`
        } else if (json) {
            return `<${item.constructor.name} object ${json.length > 300 ? json.substring(0, 300) + ' [...]' : json}>`;
        } else {
            return `<${item.constructor.name} object (not stringifyable)>`;
        }
    }

    return json || `${item}`;
}

const logCallbacks = new Map<number, LogCallback>();

/**
 * Add a log callback
 */
export function addLogCallback(callback: LogCallback) {
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
                logger.warn("WARNING:", message.message);
            } else {
                throw new Error(message.message);
            }
        }
    }
}