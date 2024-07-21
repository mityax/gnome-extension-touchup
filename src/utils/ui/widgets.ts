import St from "@girs/st-14";
import GObject from "@girs/gobject-2.0";
import {filterObject} from "$src/utils/utils";


export namespace Widgets {
    export class Ref<T> {
        value: T | null = null;
    }

    type UiProps<T> = {
        ref?: Ref<T>,
        connect?: Record<string, (...args: any[]) => any>,
    };

    function filterConfig<T>(config: UiProps<T>): any {
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

        constructor(config: St.Button.ConstructorProperties & UiProps<Button>) {
            super(filterConfig(config));
            initWidget(this, config)
        }
    }

    export class Icon extends St.Icon {
        static {
            GObject.registerClass(this);
        }

        constructor(config: St.Icon.ConstructorProperties & UiProps<Icon>) {
            super(filterConfig(config));
            initWidget(this, config);
        }
    }

    export class Label extends St.Label {
        static {
            GObject.registerClass(this);
        }

        constructor(config: St.Label.ConstructorProperties & UiProps<Label>) {
            super(filterConfig(config));
            initWidget(this, config);
        }
    }

    export class Bin extends St.Bin {
        static {
            GObject.registerClass(this);
        }

        constructor(config: St.Bin.ConstructorProperties & UiProps<Bin>) {
            super(filterConfig(config));
            initWidget(this, config);
        }
    }

    export class Box extends St.BoxLayout {
        static {
            GObject.registerClass(this);
        }

        constructor(config: St.BoxLayout.ConstructorProperties & UiProps<Box> & { children?: St.Widget[] }) {
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

        constructor(config: Omit<St.BoxLayout.ConstructorProperties, 'vertical'> & UiProps<Row> & {
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

        constructor(config: Omit<St.BoxLayout.ConstructorProperties, 'vertical'> & UiProps<Column> & {
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

        constructor(config: Omit<St.ScrollView.ConstructorProperties, 'child'> & UiProps<St.ScrollView> & {
            child?: St.Widget
        }) {
            super({
                ...filterConfig(config)
            });
            initWidget(this, config);
            if (config.child) {
                if (typeof config.child.hadjustment !== 'undefined') {
                    this.set_child(config.child as unknown as St.Scrollable);
                } else {
                    const s = new St.Viewport();
                    s.add_child(config.child);
                    this.set_child(s)
                }
            }
        }
    }
}