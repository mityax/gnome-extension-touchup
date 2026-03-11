// SPDX-FileCopyrightText: 2026 mityax, 2026
//
// SPDX-License-Identifier: GPL-3.0-only

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

// Maps a class with `$signals` to a props object with transformed signal names
export type SignalPropsFromClass<T> =
    T extends { $signals: infer S } // Extract `$signals` type from the class
        ? {
              // Iterate over all signal keys and rename them
              [K in keyof S as TransformSignalName<K & string>]?:
                  S[K] extends (...args: infer A) => infer R
                      // Rebuild function signature with `instance: T` as first arg
                      ? (instance: T, ...args: A) => R
                      : never;
          }
        : never; // If `$signals` does not exist