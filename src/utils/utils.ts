import '@girs/gnome-shell/extensions/global';
import St from "@girs/st-14";
import Clutter from "@girs/clutter-14";
import GObject from "@girs/gobject-2.0";
import GnomeTouchExtension from "$src/extension";
import GLib from "@girs/glib-2.0";
import Gio, {Cancellable} from "@girs/gio-2.0";
import FileCreateFlags = Gio.FileCreateFlags;


/**
 * Used as a placeholder for external classes that we have no
 * type definitions of, to get rid of typescript errors.
 */
export type UnknownClass = Record<string, any>;



export function getStyle(widgetType: GObject.AnyClass = St.Widget, elementId: string = '', elementClass: string = '') {
    const ctx = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage);
    const node = St.ThemeNode.new(
        ctx,
        null, /* parent node */
        ctx.get_theme(),
        //@ts-ignore
        widgetType, /* gtype */
        elementId, /* id */
        elementClass, /* class */
        '', /* pseudo class */
        ''); /* inline style */
    return node;
}


/**
 * Recursively walks the topActor's nested children until a child is found that satisfies `test`.
 * If no such child is found, returns `null`
 */
export function findActorBy(topActor: Clutter.Actor, test: (actor: Clutter.Actor) => boolean): Clutter.Actor | null {
    let children = topActor.get_children();

    for (let child of children) {
        if (test(child)) {
            return child;
        } else if (child.get_n_children()) {
            let result = findActorBy(child, test);
            if (result) {
                return result;
            }
        }
    }

    return null;
}

/**
 * Recursively walks the topActor's nested children until a child with the given `name` is found.
 * If no such child is found, returns `null`
 */
export function findActorByName(topActor: Clutter.Actor, name: string): Clutter.Actor | null {
    return findActorBy(topActor, a => a.name === name);
}



//// LOGGING /////
const logFile = GLib.getenv('GNOMETOUCH_LOGFILE') ?? '/tmp/gnometouch.log';  // TODO: remove default value


export function log(...text: any[]) {
    console.log("GJS:gnometouch:", ...text.map(item => {
        if (item && item instanceof Error) {
            console.error(item, item.message || '', "\n", item.stack)
        }

        return repr(item);
    }));

    if (logFile) {
        const stream = Gio.File.new_for_path(logFile).append_to(FileCreateFlags.NONE, null);

        const msg = text.map(item => {
            return item && item instanceof Error
                ? `Error (${item}): ` + (item.message || '')
                : repr(item);
        }).join(" ");

        // @ts-ignore
        stream.write_bytes(new GLib.Bytes(`${new Date().toISOString()}: ${msg}\n`), null);
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

export function clamp(x: number, min: number, max: number) {
    if (max < min) {
        [min, max] = [max, min];
    }
    return Math.min(Math.max(x, min), max);
}


export function randomChoice<T>(arr: T[]): T {
    return arr[Math.floor(arr.length * Math.random())];
}


export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type ObjectEntry<T> = {
    [K in keyof T]: [K, T[K]]
}[keyof T]

export function filterObject<T extends object>(
    obj: T,
    fn: (entry: ObjectEntry<T>, i: number, arr: ObjectEntry<T>[]) => boolean
) {
    return Object.fromEntries(
        //@ts-ignore
        (Object.entries(obj) as ObjectEntry<T>[]).filter(fn)
    ) as Partial<T>
}


export function mapObject<T extends object>(
    obj: T,
    fn: (entry: ObjectEntry<T>, i: number, arr: ObjectEntry<T>[]) => ObjectEntry<T>
) {
    return Object.fromEntries(
        //@ts-ignore
        (Object.entries(obj) as ObjectEntry<T>[]).map(fn)
    );
}



