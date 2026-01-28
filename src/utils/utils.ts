import Clutter from "gi://Clutter";


/**
 * Used as a placeholder for external classes that we have no
 * type definitions of, to get rid of typescript errors.
 */
export type UnknownClass = Record<string, any>;


/**
 * Recursively walks the topActor's nested children until a child is found that satisfies `test`.
 * If no such child is found, returns `null`
 */
export function findActorBy<T extends Clutter.Actor>(topActor: T, test: (actor: T) => boolean): T | null {
    for (let child of topActor.get_children()) {
        if (test(child as T)) {
            return child as T;
        } else if (child.get_n_children()) {
            let result = findActorBy(child as T, test);
            if (result) {
                return result;
            }
        }
    }

    return null;
}

/**
 * Recursively walks the topActor's nested children, collecting all actors that satisfy `test`.
 *
 * Does net descend further into the children of matching actors.
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


export function clamp(value: number, min: number, max: number) {
    if (max < min) {
        [min, max] = [max, min];
    }
    return Math.min(Math.max(value, min), max);
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


/**
 * Returns `v` if it exists in `filter`, otherwise returns `orElse` (if provided) or
 * `undefined` otherwise.
 */
export function oneOf<T, E>(v: any, filter: T[]): undefined
export function oneOf<T, E>(v: any, filter: T[], orElse: E): E
export function oneOf<T, E>(v: any, filter: T[], orElse?: E): E | undefined {
    if (filter.includes(v)) {
        return v;
    }
    return orElse;
}