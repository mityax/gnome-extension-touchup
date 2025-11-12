/**
 * Converts kebab-case strings like "show-popup" into CamelCase ("ShowPopup").
 */
type KebabToCamelCase<S extends string> =
    S extends `${infer First}-${infer Rest}`
        ? `${Capitalize<First>}${KebabToCamelCase<Rest>}`
        : Capitalize<S>;

/**
 * Transforms a signal name into a prop name.
 *
 * Examples:
 *  "clicked"             -> "onClicked"
 *  "notify::checked"     -> "notifyChecked"
 *  "notify::icon-name"   -> "notifyIconName"
 */
type TransformSignalName<S extends string> =
    S extends `notify::${infer Prop}`
        ? `notify${Capitalize<KebabToCamelCase<Prop>>}`
        : S extends `${infer Type}::${infer Prop}`
            ? `on${Capitalize<KebabToCamelCase<Type>>}${Capitalize<KebabToCamelCase<Prop>>}`
            : `on${Capitalize<KebabToCamelCase<S>>}`;

export type SignalPropsFromSignatures<TSignatures> = {
    [K in keyof TSignatures as TransformSignalName<K & string>]?: TSignatures[K];
};

export type SignalPropsFromClass<T> =
    T extends { $signals: infer S }
        ? { [K in keyof S as TransformSignalName<K & string>]?: S[K] }
        : never;