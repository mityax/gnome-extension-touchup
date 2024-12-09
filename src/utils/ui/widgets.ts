import St from "gi://St";
import GObject from "gi://GObject";
import {filterObject} from "$src/utils/utils";
import Clutter from "gi://Clutter";


export namespace Widgets {
    export class Ref<T extends Clutter.Actor> {
        get value(): T | null {
            return this._value;
        }

        set value(value: T | null) {
            this._value = value;
            value?.connect('destroy', () => this.value = null);
        }

        private _value: T | null = null;
    }

    type UiProps<T extends Clutter.Actor> = {
        ref?: Ref<T>,
        connect?: Record<string, (...args: any[]) => any>,
    };

    function filterConfig<T extends Clutter.Actor>(config: UiProps<T>): any {
        const filterOut = ['ref', 'connect', 'children', 'child'];
        return filterObject(
            config,
            //@ts-ignore
            entry => filterOut.indexOf(entry[0]) === -1
        )
    }

    function initWidget<T extends St.Widget>(w: T, props: UiProps<T>) {
        if (props.ref) props.ref.value = w;
        if (props.connect && Object.entries(props.connect).length > 0) {
            for (let signal in props.connect) {
                if (Object.hasOwn(props.connect, signal)) {
                    w.connect(signal, props.connect[signal]);
                }
            }
        }
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
            if (config.child) {
                this.set_child(config.child);
            }
        }
    }

    export class Box extends St.BoxLayout {
        static {
            GObject.registerClass(this);
        }

        constructor(config: Partial<St.BoxLayout.ConstructorProps> & UiProps<Box> & { children?: St.Widget[] }) {
            super(filterConfig(config));
            initWidget(this, config);
            if (config.children) {
                config.children.forEach(c => this.add_child(c));
            }
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
            if (config.children) {
                config.children.forEach(c => this.add_child(c));
            }
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
            if (config.children) {
                config.children.forEach(c => this.add_child(c));
            }
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