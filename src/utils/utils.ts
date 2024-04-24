import '@girs/gnome-shell/extensions/global';
import St from "@girs/st-13";
import Clutter from "@girs/clutter-13";
import GObject from "@girs/gobject-2.0";


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


export function foregroundColorFor(color: Clutter.Color, opacity: number = 1) {
    return Clutter.Color.from_string(
        color.to_hls()[1] > 0.5
            ? `rgba(0,0,0,${opacity})`
            : `rgba(255,255,255,${opacity})`,
        )[1];
}


export function findActorByName(topActor: Clutter.Actor, name: string): Clutter.Actor | undefined {
    let children = topActor.get_children();

    for (let child of children) {
        if (child.name === name) {
            return child;
        } else if (child.get_n_children()) {
            let result = findActorByName(child, name);

            if (result) {
                return result;
            }
        }
    }
}



export function log(...text: any[]) {
    console.log("GJS:gnometouch:", ...text.map(item => {
        let json;
        try {
            if (typeof item === 'object' || Array.isArray(item)) {
                json = JSON.stringify(item);
            }
        } catch (e) {}

        if (typeof item === 'object' && item.constructor && item.constructor.name) {
            if (json) {
                return `<${item.constructor.name} object ${json.length > 300 ? json.substring(0, 300) + ' [...]' : json}>`;
            } else {
                return `<${item.constructor.name} object (not stringifyable)>`;
            }
        }

        return json || item;
    }));
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



