import {filterObject, mapObject} from "./utils";
import St from "@girs/st-13";
import Clutter from "@girs/clutter-13";
import { css } from "./css";

declare namespace JSX {
    interface ElementAttributesProperty {
        args: Record<string, any>; // specify the property name to use
    }

    interface ElementChildrenAttribute {
        children: {}; // specify children name to use
    }
}

export interface Type<T> extends Function { new (...args: any[]): T; }


interface JSXComponentBaseProps<T> {
    ref?: Ref<T>;
    style?: string | object;
}

export abstract class JSXComponent<
    T extends Type<any>,
    PropsT extends object = Partial<ConstructorParameters<T>>
> {

    constructor(
        public args: Omit<PropsT, 'style'> & JSXComponentBaseProps<T>,
        public children: Array<any>,
    ) {
        this.args = args;
        this.children = children;
    }

    abstract render(): T;

    performRender() {
        const widget = this.render();
        if (this.ref) {
            this.ref.value = widget;
        }
        return widget;
    }

    setupEventHandlers<T extends Clutter.Actor>(actor: T): T {
        const handlers = this.eventHandlers;

        if (Object.keys(handlers).length > 0 && !Object.hasOwn(this.props as object, 'reactive')) {
            // Automatically make actor reactive if we have at least one event handler:
            actor.set_property('reactive', true);

            for (let handler in handlers) {
                if (Object.hasOwn(handlers, handler)) {
                    actor.connect(handler, handlers[handler]);
                }
            }
        }

        return actor;
    }

    get props(): PropsT {
        const {ref, ...props} = this.args;
        const res = filterObject(
            props,
            ([k, v]) => !k.toString().startsWith('on:'),
        ) as PropsT;
        if (Object.hasOwn(res, 'style')) {
            res.style = css(res.style) || undefined;
        }
        return res;
    }

    get eventHandlers(): Record<string, (...args: any[]) => void> {
        const filtered = filterObject(
            this.args,
            ([k, v]) => k.toString().startsWith('on:'),
        ) as Record<string, (...args: any[]) => void>;
        return mapObject(
            filtered,
            ([k, v]) => ([k.toString().substring(3), v])
        );
    }

    get ref(): Ref<T> | undefined {
        const {ref, ..._} = this.args;
        return ref;
    }

    get textContent(): string {
        if (Array.isArray(this.children)) {
            return this.children.join('');
        }
        return this.children.toString();
    }
}

export class Ref<T> {
    declare public value: T
}


export function jsx<T extends Type<any>>(
    comp: new (props: Record<string, any>, children: any[], ref?: Ref<T>) => JSXComponent<T>,
    args: Record<string, any>
): T {
    let {children, ...props} = args;

    // Make sure [children] always is a (potentially empty) array:
    children = children && !Array.isArray(children) ? [children] : children || [];

    // Create our component:
    const res= new comp(props, children);

    // And render it:
    return res.performRender();
}


export function jsxs<T extends Type<any>>(
    comp: new (props: Record<string, any>, children: any[], ref?: Ref<T>) => JSXComponent<T>,
    args: Record<string, any>
): T {
    return jsx(comp, args);
}
