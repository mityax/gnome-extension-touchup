export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type ObjectEntry<T> = {
    [K in keyof T]: [K, T[K]]
}[keyof T]

export function filterObject<T extends object>(
    obj: T,
    fn: (entry: ObjectEntry<T>, i: number, arr: ObjectEntry<T>[]) => boolean
) {
    return Object.fromEntries(
        (Object.entries(obj) as ObjectEntry<T>[]).filter(fn)
    ) as Partial<T>
}


export function mapObject<T extends object>(
    obj: T,
    fn: (entry: ObjectEntry<T>, i: number, arr: ObjectEntry<T>[]) => ObjectEntry<T>
) {
    return Object.fromEntries(
        (Object.entries(obj) as ObjectEntry<T>[]).map(fn)
    );
}


