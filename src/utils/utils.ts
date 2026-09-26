
/**
 * Used as a placeholder for external classes that we have no
 * type definitions of, to get rid of typescript errors.
 */
export type UnknownClass = Record<string, any>;


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


/**
 * Helper to make typescript statically check whether a switch is exhaustive or not.
 *
 * Use like:
 *
 * ```js
 * switch(value) {
 *     case A:
 *         break;
 *     case B:
 *         break;
 *     default:
 *         DEBUG: assertExhaustive(value);
 * }
 * ```
 */
export function assertExhaustive(p: never) {}

