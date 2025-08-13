/**
 * Utility types for extracting and transforming signals from widget classes.
 *
 * This set of utility types allows us to easily define the types of properties
 * corresponding to signals that can be connected to widgets. The main utility
 * is `SignalPropsFromClasses<[TClasses]>`, which can be used to extract all signal names
 * from a set of classes (a widget and it's ancestors) and map them to their
 * respective callback types.
 *
 * ### Example 1: Basic Usage with `SignalPropsFromClasses`
 *
 * ```typescript
 * class SomeWidget extends St.Widget {
 *     connect(signal: 'clicked', callback: (_source: this) => void): number;
 *     connect(signal: 'hovered', callback: (_source: this, event: Event) => boolean): number;
 * }
 *
 * // Extract signal properties for MyWidget
 * type SomeWidgetSignalProps = SignalPropsFromClasses<[SomeWidget, St.Widget, Clutter.Actor]>;
 *
 * // The resulting type will look like this:
 * type SomeWidgetSignalProps = {
 *     onClicked?: (_source: SomeWidget) => void;  // "signal-name" becomes "onSignalName"
 *     onHovered?: (_source: SomeWidget, event: Event) => boolean;
 *     onDestroy?: (_source: SomeWidget) => void,
 *     notifySize?: (_source: SomeWidget) => void,  // "notify::<prop-name>" becomes "notifyPropName"
 *     // ... all other signals defined on any of SomeWidget, St.Widget, Clutter.Actor
 * };
 *
 * // Usage example:
 * const widgetProps: SomeWidgetSignalProps = {
 *     onClicked: (source) => { logger.debug('Widget clicked!', source); },
 *     onHovered: (source, event) => { logger.debug('Widget hovered!', event); return true; },
 * };
 * ```
 */



// Extracts all signal names from a widget by inferring them from `connect("<signal-name>", callback)` functions.
// Helper type to extract all overloads of `connect` and accumulate signal names.
type ExtractSignals<T> = T extends { connect: any }
    ? OverloadParameters<T['connect']> extends infer P
        ? P extends [infer Signal, ...any[]]
            ? Signal extends string
                ? string extends Signal // Exclude broad `string`
                    ? never
                    : Signal
                : never
            : never
        : never
    : never;

// Helper to explicitly union all overloads' signal names
type AllSignalNames<T> = ExtractSignals<T>;

// Retrieves the callback type for a specific signal name.
type SignalCallback<T, S extends string> = T extends {
        connect(signal: S, callback: infer C): number;
    }
    ? C
    : never;

// Extracts signal names from an array of classes by recursively combining signals from each class.
type SignalsFromClasses<TClasses extends unknown[]> = TClasses extends [infer First, ...infer Rest]
    ? AllSignalNames<First> | SignalsFromClasses<Rest>
    : never;

// Maps signal names to their respective callback types as properties, supporting multiple classes.
export type SignalPropsFromClasses<TClasses extends unknown[]> = {
    [S in SignalsFromClasses<TClasses> as TransformSignalName<S>]?: SignalCallback<TClasses[number], S>;
};

// Converts kebab-case signal names like "show-popup" into camelCase property names like "onShowPopup".
type KebabToCamelCase<S extends string> = S extends `${infer First}-${infer Rest}`
    ? `${Capitalize<First>}${KebabToCamelCase<Rest>}`
    : Capitalize<S>;

// Transforms a signal name into its corresponding property name.
// Example: "notify::prop-name" -> "notifyOnPropName", "signal-name" -> "onSignalName".
type TransformSignalName<S extends string> = S extends `notify::${infer Prop}`
    ? `notify${Capitalize<KebabToCamelCase<Prop>>}`
    : `on${Capitalize<KebabToCamelCase<S>>}`;

// Extracts notify signals for properties that have corresponding getter methods.
// A `notify` signal corresponds to both a `get_*` method and a `get propertyName()` accessor.
type ExtractNotifySignals<T> = {
    [K in keyof T as K extends `get_${infer Rest}`
        ? Rest extends keyof T
            ? `notify::${SnakeToKebabCase<Rest>}`
            : never
        : never]: K;
};

// Retrieves the keys of notify signals from a widget's type.
export type NotifySignalKeys<T> = keyof ExtractNotifySignals<T>;

// Defines notify signal properties, mapping notify signal names to callback functions.
type NotifySignalProps<T> = {
    [K in NotifySignalKeys<T> as TransformSignalName<K & string>]?: (_source: T) => void;
};

// Converts snake_case strings to kebab-case strings.
// Example: "icon_name" -> "icon-name".
type SnakeToKebabCase<S extends string> = S extends `${infer First}_${infer Rest}`
    ? `${Lowercase<First>}-${SnakeToKebabCase<Rest>}`
    : Lowercase<S>;



/*
// The same without support for notify:: signals:
type ExtractSignals<T> = T extends {
        connect(signal: infer S, callback: any): any;
    }
    ? S extends string
        ? S
        : never
    : never;
type SignalCallback<T, S extends string> = T extends {
        connect(signal: S, callback: infer C): any;
    }
    ? C
    : never;
type SignalsFromClasses<TClasses extends unknown[]> = TClasses extends [infer First, ...infer Rest]
    ? ExtractSignals<First> | SignalsFromClasses<Rest>
    : never;
type SignalPropsFromClasses<TClasses extends unknown[]> = {
    [S in SignalsFromClasses<TClasses> as TransformSignalName<S>]?: SignalCallback<TClasses[number], S>;
};
type SignalPropsForWidget<T extends St.Widget> = SignalPropsFromClasses<[T, St.Widget, Clutter.Actor, GObject.InitiallyUnowned]>;


// Typing utilities to go from the signal name "show-popup" to the property name "onShowPopup":
type KebabToCamelCase<S extends string> = S extends `${infer First}-${infer Rest}`
    ? `${Capitalize<First>}${KebabToCamelCase<Rest>}`
    : Capitalize<S>;
type TransformSignalName<S extends string> =
    S extends `notify::${infer Prop}`
        ? `onNotify${Capitalize<KebabToCamelCase<Prop>>}`
        : `on${Capitalize<KebabToCamelCase<S>>}`;
*/



// Helpers to convert overload types into a union:

type _OverloadUnion<TOverload, TPartialOverload = unknown> = TPartialOverload & TOverload extends (
        ...args: infer TArgs
    ) => infer TReturn
    ? // Prevent infinite recursion by stopping recursion when TPartialOverload
    // has accumulated all of the TOverload signatures.
    TPartialOverload extends TOverload
        ? never
        :
        | _OverloadUnion<TOverload, Pick<TOverload, keyof TOverload> & TPartialOverload & ((...args: TArgs) => TReturn)>
        | ((...args: TArgs) => TReturn)
    : never;

type OverloadUnion<TOverload extends (...args: any[]) => any> = Exclude<
    _OverloadUnion<
        // The "() => never" signature must be hoisted to the "front" of the
        // intersection, for two reasons: a) because recursion stops when it is
        // encountered, and b) it seems to prevent the collapse of subsequent
        // "compatible" signatures (eg. "() => void" into "(a?: 1) => void"),
        // which gives a direct conversion to a union.
        (() => never) & TOverload
    >,
    TOverload extends () => never ? never : () => never
>;

/*
The tricks to the above recursion are...

a) Inferring the parameter and return types of an overloaded function will use
the last overload signature, which is apparently an explicit design choice.

b) Intersecting a single signature with the original intersection, can reorder
the intersection (possibly an undocumented side effect?).

c) Intersections can only be re-ordered, not narrowed (reduced), So, the
intersection has to be rebuilt in the "TPartialOverload" generic, then
recursion can be stopped when the full intersection has been rebuilt.
Otherwise, this would result in an infinite recursion.
*/

// Note that the order of overloads is maintained in the union, which means
// that it's reversible using a UnionToIntersection type where the overload
// order matters. The exception is "() => never", which has to be hoisted
// to the front of the intersection. However, it's the most specific signature,
// which means hoisting it should be safe if the union is converted back to an
// intersection.

// Inferring a union of parameter tuples or return types is now possible.
type OverloadParameters<T extends (...args: any[]) => any> = Parameters<OverloadUnion<T>>;
