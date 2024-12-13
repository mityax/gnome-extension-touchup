import St from "gi://St";
import GObject from "gi://GObject";
import {filterObject} from "$src/utils/utils";
import Clutter from "gi://Clutter";
import {NotifySignalProps, SignalPropsFromClasses} from "$src/utils/signal_props";


export namespace Widgets {
    export class Ref<T extends St.Widget> {
        get current(): T | null {
            return this._value;
        }

        set(value: T | null): void {
            this._value = value;
            value?.connect('destroy', () => this.set(null));
        }

        private _value: T | null = null;
    }

    type UiProps<T extends St.Widget> = {
        ref?: Ref<T>,
        onCreated?: (widget: T) => void,
    } & Partial<SignalPropsForWidget<T>>;

    function filterConfig<T extends St.Widget>(config: UiProps<T>): any {
        const filterOut = [
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

        constructor(config: Partial<St.Button.ConstructorProps> & UiProps<Button>) {
            super(filterConfig(config));
            initWidget(this, config)
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