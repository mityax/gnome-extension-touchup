import St from "gi://St";
import GObject from "gi://GObject";
import {filterObject} from "$src/utils/utils";
import Clutter from "gi://Clutter";
import {NotifySignalProps, SignalPropsFromClasses} from "$src/utils/signal_props";
import {Delay} from "$src/utils/delay.ts";


export namespace Widgets {
    /**
     * Helper class to manage references to [Clutter.Actor] instances.
     *
     * If the referenced actor is destroyed, the reference will be
     * automatically set to `null`.
     */
    export class Ref<T extends Clutter.Actor> {
        private _destroySignalId: number | undefined;

        /**
         * Create a reference with an optional initial value.
         */
        constructor(initialValue?: T | null) {
            this.set(initialValue ?? null);
        }

        /**
         * Get the actor the reference points to, or `null` if the actor has been
         * destroyed or unset.
         */
        get current(): T | null {
            return this._value;
        }

        /**
         * Update the reference to point to the given actor, unset the reference if
         * `null` is passed.
         */
        set(value: T | null): void {
            if (this._destroySignalId !== undefined && this._value) {
                this._value.disconnect(this._destroySignalId);
            }
            this._value = value;
            this._destroySignalId = value?.connect('destroy', () => this.set(null));
        }

        /**
         * Convenience method to call the given function or closure on the referenced
         * actor only if there is a referenced actor at the moment.
         *
         * Example:
         * ```typescript
         * const myRef = new Ref(myWidget);
         *
         * // Set the widget's opacity only if it has not been destroyed or in another way unset yet:
         * myRef.apply(w => w.opacity = 0.8);
         * ```
         */
        apply(fn: (current: T) => void) {
            if (this.current) {
                fn(this.current!);
            }
         }

        private _value: T | null = null;
    }

    type UiProps<T extends St.Widget> = {
        ref?: Ref<T>,
        onCreated?: (widget: T) => void,
    } & Partial<SignalPropsForWidget<T>>;

    function filterConfig<T extends St.Widget>(config: UiProps<T>, filterOut?: (string | RegExp)[]): any {
        filterOut ??= [
            'ref', 'children', 'child', 'onCreated', /^(on|notify)[A-Z]/,
        ];
        return filterObject(
            config,
            //@ts-ignore
            entry => typeof entry[0] === "string" && (
                !filterOut.some((filter) => filter instanceof RegExp
                    ? filter.test(entry[0] as string)
                    : filter === entry[0])
            )
        )
    }

    function initWidget<T extends St.Widget>(w: T, props: UiProps<T>) {
        if (props.ref) props.ref.set(w);

        // Automatically connect signals from the constructor (e.g. `onClicked` or `notifySize`):
        for (const [key, value] of Object.entries(props)) {
            if (/^(on|notify)[A-Z]/.test(key) && typeof value === "function" && key !== "onCreated") {
                const signalName = key.replace(/^on/, "").replace(/^notify/, 'notify::')
                    .replace(/(\w)([A-Z])/g, "$1-$2").toLowerCase();
                w.connect(signalName, value as any);
            }
        }

        props.onCreated?.(w)
    }

    export class Button extends St.Button {
        static {
            GObject.registerClass(this);
        }

        constructor(config: Partial<St.Button.ConstructorProps> & UiProps<Button> & {onLongPress?: (source: Button) => void}) {
            super(filterConfig(config));
            initWidget(this, filterConfig(config, config.onLongPress ? ['onLongPress', 'onClicked'] : []))
            if (config.onLongPress) {
                this._setupLongPress(config.onLongPress, config.onClicked as any);
            }
        }

        // A simple long press implementation, that is triggered after holding the button for 500ms
        // and cancelled when moving up earlier or when moving the finger too much. Only reacts
        // to touch events.
        private _setupLongPress(onLongPress: (source: Button) => void, onClicked?: (source: Button) => void) {
            let downAt: {t: number, x: number, y: number} | undefined;

            this.connect('touch-event', (_, evt: Clutter.Event) => {
                if (evt.type() == Clutter.EventType.TOUCH_BEGIN) {
                    let thisDownAt = downAt = {t: evt.get_time(), x: evt.get_coords()[0], y: evt.get_coords()[1]};
                    Delay.ms(500).then(() => {
                        if (this.pressed && downAt?.t === thisDownAt.t && downAt?.x === thisDownAt.x && downAt?.y === thisDownAt.y) {
                            // Long press detected!
                            onLongPress(this);
                            downAt = undefined;
                        }
                    })
                } else if (evt.type() == Clutter.EventType.TOUCH_END && downAt) {
                    if (evt.get_time() - downAt.t < 500) onClicked?.(this);  // Normal click detected!
                    downAt = undefined;
                } else if (evt.type() == Clutter.EventType.TOUCH_CANCEL) {
                    downAt = undefined;  // Click/long press cancelled
                } else if (evt.type() == Clutter.EventType.TOUCH_UPDATE && downAt) {
                    let dist = Math.sqrt((evt.get_coords()[0] - downAt.x)**2 + (evt.get_coords()[1] - downAt.y)**2)
                    if (dist > 15 * St.ThemeContext.get_for_stage(global.stage as any).scaleFactor) {
                        downAt = undefined;  // Long press cancelled, finger moved too much
                    }
                }
            });
        }
    }

    export class Icon extends St.Icon {
        static {
            GObject.registerClass(this);
        }

        constructor(config: Partial<St.Icon.ConstructorProps> & UiProps<Icon>) {
            super(filterConfig(config));
            initWidget(this, config);
        }
    }

    export class Label extends St.Label {
        static {
            GObject.registerClass(this);
        }

        constructor(config: Partial<St.Label.ConstructorProps> & UiProps<Label>) {
            super(filterConfig(config));
            initWidget(this, config);
        }
    }

    export class Bin extends St.Bin {
        static {
            GObject.registerClass(this);
        }

        constructor(config: Partial<St.Bin.ConstructorProps> & UiProps<Bin>) {
            super(filterConfig(config));
            initWidget(this, config);
            if (config.child) this.set_child(config.child);
        }
    }

    export class Box extends St.BoxLayout {
        static {
            GObject.registerClass(this);
        }

        constructor(config: Partial<St.BoxLayout.ConstructorProps> & UiProps<Box> & { children?: St.Widget[] }) {
            super(filterConfig(config));
            initWidget(this, config);
            config.children?.forEach(c => this.add_child(c));
        }
    }

    export class Row extends St.BoxLayout {
        static {
            GObject.registerClass(this);
        }

        constructor(config: Partial<Omit<St.BoxLayout.ConstructorProps, 'vertical'>> & UiProps<Row> & {
            children?: St.Widget[]
        }) {
            super({
                ...filterConfig(config),
                vertical: false,
            });
            initWidget(this, config);
            config.children?.forEach(c => this.add_child(c));
        }
    }


    export class Column extends St.BoxLayout {
        static {
            GObject.registerClass(this);
        }

        constructor(config: Partial<Omit<St.BoxLayout.ConstructorProps, 'vertical'>> & UiProps<Column> & {
            children?: St.Widget[]
        }) {
            super({
                ...filterConfig(config),
                vertical: true,
            });
            initWidget(this, config);
            config.children?.forEach(c => this.add_child(c));
        }
    }

    export class ScrollView extends St.ScrollView {
        static {
            GObject.registerClass(this);
        }

        constructor(config: Partial<Omit<St.ScrollView.ConstructorProps, 'child'>> & UiProps<St.ScrollView> & {
            child?: St.Widget
        }) {
            super({
                ...filterConfig(config)
            });
            initWidget(this, config);
            if (config.child) {
                if ('vadjustment' in config.child) {
                    this.set_child(config.child as unknown as St.Scrollable);
                } else {
                    const s = new St.BoxLayout();
                    s.add_child(config.child);
                    this.set_child(s)
                }
            }
        }
    }
}


// Defines signal properties for a widget, incorporating common widget classes and notify signals.
type SignalPropsForWidget<T> = SignalPropsFromClasses<
    [T, St.Widget, Clutter.Actor, GObject.InitiallyUnowned]
> & NotifySignalProps<T>;