import '@girs/gnome-shell/extensions/global';
import Clutter from "gi://Clutter";
import {log} from "$src/utils/logging";


/**
 * Used as a placeholder for external classes that we have no
 * type definitions of, to get rid of typescript errors.
 */
export type UnknownClass = Record<string, any>;


/**
 * Recursively walks the topActor's nested children until a child is found that satisfies `test`.
 * If no such child is found, returns `null`
 */
export function findActorBy(topActor: Clutter.Actor, test: (actor: Clutter.Actor) => boolean): Clutter.Actor | null {
    for (let child of topActor.get_children()) {
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
 * Recursively walks the topActor's nested children, collecting all children that satisfy `test`.
 */
export function findAllActorsBy(topActor: Clutter.Actor, test: (actor: Clutter.Actor) => boolean): Clutter.Actor[] {
    const res: Clutter.Actor[] = [];

    for (let child of topActor.get_children()) {
        if (test(child)) {
            res.push(child);
        } else if (child.get_n_children()) {
            res.push(...findAllActorsBy(child, test));
        }
    }

    return res;
}

/**
 * Recursively walks the topActor's nested children until a child with the given `name` is found.
 * If no such child is found, returns `null`
 */
export function findActorByName(topActor: Clutter.Actor, name: string): Clutter.Actor | null {
    return findActorBy(topActor, a => a.name === name);
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


export async function measureTime(label: string, fn: () => Promise<any> | any) {
    let start = Date.now();
    await fn();
    log(`Operation \`${label}\`: ${(Date.now() - start).toFixed(1)}ms`)
}

